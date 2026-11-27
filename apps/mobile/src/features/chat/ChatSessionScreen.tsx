import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type {
  AgentExecutionMode,
  GitDiffResponse,
  ModelInfo,
  PermissionDecision,
  PermissionRequestPayload,
  SessionStatus,
  StreamEventEnvelope,
} from '@agent-remote/protocol';
import {
  ArrowLeft,
  Copy,
  FileDiff,
  MoreVertical,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react-native';
import { ApprovalSheet } from '@/components/ApprovalSheet';
import { FilesChangedBar } from '@/components/FilesChangedBar';
import { FloatingComposer } from '@/components/FloatingComposer';
import { MessageContent } from '@/components/MessageContent';
import { ToolCallCard } from '@/components/ToolCallCard';
import {
  fetchModels,
  fetchSessions,
  fetchWorkspaceDiff,
} from '@/core/network/apiClient';
import { getBridgeSocket } from '@/core/network/socketClient';
import { loadActiveHost, type SavedHost } from '@/core/storage/hostStore';
import { colors } from '@/theme/colors';

type TimelineItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string; timestamp?: string }
  | { id: string; kind: 'thinking'; text: string }
  | { id: string; kind: 'error'; text: string }
  | {
      id: string;
      kind: 'tool';
      toolName: string;
      summary: string;
      outputPreview?: string;
      ok?: boolean;
    };

const TimelineRow = memo(function TimelineRow({ item }: { item: TimelineItem }) {
  if (item.kind === 'tool') {
    return (
      <ToolCallCard
        toolName={item.toolName}
        summary={item.summary}
        outputPreview={item.outputPreview}
        ok={item.ok}
      />
    );
  }

  if (item.kind === 'thinking') {
    return (
      <View style={styles.thinkingBox}>
        <Text style={styles.thinkingLabel}>Thought process</Text>
        <Text style={styles.thinkingText}>{item.text}</Text>
      </View>
    );
  }

  if (item.kind === 'error') {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>{item.text}</Text>
      </View>
    );
  }

  if (item.kind === 'user') {
    return (
      <View style={styles.userBubble}>
        <Text style={styles.userText} selectable>
          {item.text}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.assistantBlock}>
      <MessageContent text={item.text} />
      <View style={styles.msgActions}>
        <Copy size={15} color={colors.textMuted} />
        <ThumbsUp size={15} color={colors.textMuted} />
        <ThumbsDown size={15} color={colors.textMuted} />
        {item.timestamp ? (
          <Text style={styles.msgTime}>{item.timestamp}</Text>
        ) : null}
      </View>
    </View>
  );
});

export function ChatSessionScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [host, setHost] = useState<SavedHost | null>(null);
  const [title, setTitle] = useState('Agent Session');
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>();
  const [mode, setMode] = useState<AgentExecutionMode>('accept-edits');
  const [input, setInput] = useState('');
  const [diffSummary, setDiffSummary] = useState<GitDiffResponse | null>(null);
  const [pendingApproval, setPendingApproval] =
    useState<PermissionRequestPayload | null>(null);

  const listRef = useRef<FlatList<TimelineItem>>(null);
  const lastSeqRef = useRef(0);
  const pendingEventsRef = useRef<StreamEventEnvelope[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshDiff = useCallback(async (activeHost: SavedHost) => {
    try {
      const diff = await fetchWorkspaceDiff(activeHost);
      setDiffSummary(diff);
    } catch {
      // Ignore diff fetch failures
    }
  }, []);

  const applyEvents = useCallback(
    (envelopes: StreamEventEnvelope[]) => {
      let shouldRefreshDiff = false;

      setItems((prev) => {
        const next = [...prev];
        for (const env of envelopes) {
          if (env.seq <= lastSeqRef.current) continue;
          lastSeqRef.current = env.seq;
          const p = env.payload;

          if (p.type === 'user.message') {
            next.push({ id: p.messageId, kind: 'user', text: p.text });
          } else if (p.type === 'assistant.delta') {
            const idx = next.findIndex(
              (i) => i.id === p.messageId && i.kind === 'assistant',
            );
            if (idx >= 0) {
              const existing = next[idx] as Extract<
                TimelineItem,
                { kind: 'assistant' }
              >;
              next[idx] = { ...existing, text: existing.text + p.delta };
            } else {
              next.push({
                id: p.messageId,
                kind: 'assistant',
                text: p.delta,
                timestamp: 'just now',
              });
            }
          } else if (p.type === 'thinking.delta') {
            const thinkId = `think:${p.messageId}`;
            const idx = next.findIndex((i) => i.id === thinkId);
            if (idx >= 0) {
              const existing = next[idx] as Extract<
                TimelineItem,
                { kind: 'thinking' }
              >;
              next[idx] = { ...existing, text: existing.text + p.delta };
            } else {
              next.push({ id: thinkId, kind: 'thinking', text: p.delta });
            }
          } else if (p.type === 'tool.call') {
            next.push({
              id: p.callId,
              kind: 'tool',
              toolName: p.toolName,
              summary: p.summary,
            });
          } else if (p.type === 'tool.result') {
            const idx = next.findIndex(
              (i) => i.id === p.callId && i.kind === 'tool',
            );
            if (idx >= 0) {
              const existing = next[idx] as Extract<
                TimelineItem,
                { kind: 'tool' }
              >;
              next[idx] = {
                ...existing,
                ok: p.ok,
                outputPreview: p.outputPreview,
              };
            }
          } else if (p.type === 'permission.request') {
            setPendingApproval(p.request);
          } else if (p.type === 'permission.resolved') {
            setPendingApproval((curr) =>
              curr?.requestId === p.requestId ? null : curr,
            );
          } else if (p.type === 'session.status') {
            setStatus(p.status);
            if (p.status === 'error' && p.error) {
              next.push({
                id: `err-${env.seq}`,
                kind: 'error',
                text: p.error,
              });
            }
          } else if (p.type === 'turn.completed') {
            shouldRefreshDiff = true;
          }
        }
        return next;
      });

      if (shouldRefreshDiff && host) {
        void refreshDiff(host);
      }
    },
    [host, refreshDiff],
  );

  // Frame-batched event flushing (~40ms) to keep 60fps scrolling on mobile
  const enqueueEvent = useCallback(
    (event: StreamEventEnvelope) => {
      pendingEventsRef.current.push(event);
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(() => {
        const batch = pendingEventsRef.current;
        pendingEventsRef.current = [];
        flushTimerRef.current = null;
        if (batch.length > 0) {
          applyEvents(batch);
        }
      }, 40);
    },
    [applyEvents],
  );

  useEffect(() => {
    void loadActiveHost().then(async (saved) => {
      setHost(saved);
      if (!saved) return;
      void refreshDiff(saved);
      try {
        const [all, modelList] = await Promise.all([
          fetchSessions(saved),
          fetchModels(saved).catch(() => []),
        ]);
        setModels(modelList);
        const found = all.find((s) => s.id === sessionId);
        if (found) {
          setTitle(found.title);
          setMode(found.mode);
          setStatus(found.status);
          setSelectedModelId(found.model ?? modelList[0]?.id);
        } else if (modelList[0]) {
          setSelectedModelId(modelList[0].id);
        }
      } catch {
        // Keep default title
      }
    });
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [sessionId, refreshDiff]);

  useEffect(() => {
    if (!host) return;
    const socket = getBridgeSocket(host);

    const subscribe = () => {
      socket.emit(
        'session:subscribe',
        { sessionId, afterSeq: lastSeqRef.current },
        (res) => {
          if (res?.ok && res.events?.length) {
            applyEvents(res.events);
          }
        },
      );
    };

    const onEvent = (event: StreamEventEnvelope) => {
      if (event.sessionId === sessionId) {
        enqueueEvent(event);
      }
    };

    socket.on('connect', subscribe);
    socket.on('session:event', onEvent);
    if (socket.connected) {
      subscribe();
    }

    return () => {
      socket.off('connect', subscribe);
      socket.off('session:event', onEvent);
      socket.emit('session:unsubscribe', { sessionId });
    };
  }, [host, sessionId, applyEvents, enqueueEvent]);

  const handleSend = () => {
    if (!host || !input.trim()) return;
    const socket = getBridgeSocket(host);
    const text = input.trim();
    setInput('');
    socket.emit('session:prompt', {
      sessionId,
      text,
      mode,
      model: selectedModelId,
    });
  };

  const handleCancel = () => {
    if (!host) return;
    getBridgeSocket(host).emit('session:cancel', { sessionId });
  };

  const handleDecision = (decision: PermissionDecision) => {
    if (!host || !pendingApproval) return;
    getBridgeSocket(host).emit('permission:respond', {
      sessionId,
      requestId: pendingApproval.requestId,
      decision,
    });
    setPendingApproval(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Custom Sleek Top Header */}
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.topRight}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.push('/diff')}
          >
            <FileDiff size={19} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.push('/settings')}
          >
            <MoreVertical size={19} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TimelineRow item={item} />}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: false })
          }
          removeClippedSubviews
          ListFooterComponent={
            <View style={styles.footerWrap}>
              {diffSummary && diffSummary.files.length > 0 ? (
                <FilesChangedBar
                  fileCount={diffSummary.files.length}
                  additions={diffSummary.totalAdditions}
                  deletions={diffSummary.totalDeletions}
                  onPressReview={() => router.push('/diff')}
                />
              ) : null}

              {status === 'running' ? (
                <Text style={styles.runningLabel}>1 task running</Text>
              ) : null}
            </View>
          }
        />

        <FloatingComposer
          value={input}
          onChangeText={setInput}
          onSubmit={handleSend}
          onCancel={handleCancel}
          isRunning={status === 'running'}
          models={models}
          selectedModelId={selectedModelId}
          onChangeModel={setSelectedModelId}
          mode={mode}
          onChangeMode={setMode}
          onPressMic={() =>
            Alert.alert('Voice Prompt', 'Voice input will be enabled in the next update.')
          }
        />
      </KeyboardAvoidingView>

      <ApprovalSheet request={pendingApproval} onDecide={handleDecision} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    padding: 6,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 14,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  assistantBlock: {
    gap: 10,
  },
  msgActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 4,
  },
  msgTime: {
    color: colors.textMuted,
    fontSize: 12,
  },
  thinkingBox: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: 10,
    paddingVertical: 4,
  },
  thinkingLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  thinkingText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  footerWrap: {
    gap: 10,
    paddingTop: 4,
  },
  runningLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
});
