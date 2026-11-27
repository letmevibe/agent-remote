import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  AgentExecutionMode,
  PermissionDecision,
  PermissionRequestPayload,
  SessionStatus,
  StreamEventEnvelope,
} from '@agent-remote/protocol';
import { Send, Square } from 'lucide-react-native';
import { ApprovalSheet } from '@/components/ApprovalSheet';
import { StatusBadge } from '@/components/StatusBadge';
import { ToolCallCard } from '@/components/ToolCallCard';
import { getBridgeSocket } from '@/core/network/socketClient';
import { loadActiveHost, type SavedHost } from '@/core/storage/hostStore';
import { colors } from '@/theme/colors';

type TimelineItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string }
  | { id: string; kind: 'thinking'; text: string }
  | {
      id: string;
      kind: 'tool';
      toolName: string;
      summary: string;
      outputPreview?: string;
      ok?: boolean;
    };

const MODES: AgentExecutionMode[] = ['plan', 'accept-edits', 'auto'];

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
        <Text style={styles.thinkingLabel}>Thinking</Text>
        <Text style={styles.thinkingText}>{item.text}</Text>
      </View>
    );
  }

  const isUser = item.kind === 'user';
  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
      <Text style={styles.bubbleText} selectable>
        {item.text}
      </Text>
    </View>
  );
});

export function ChatSessionScreen({ sessionId }: { sessionId: string }) {
  const [host, setHost] = useState<SavedHost | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [mode, setMode] = useState<AgentExecutionMode>('accept-edits');
  const [input, setInput] = useState('');
  const [pendingApproval, setPendingApproval] =
    useState<PermissionRequestPayload | null>(null);

  const lastSeqRef = useRef(0);
  const pendingEventsRef = useRef<StreamEventEnvelope[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyEvents = useCallback((envelopes: StreamEventEnvelope[]) => {
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
            const existing = next[idx] as Extract<TimelineItem, { kind: 'assistant' }>;
            next[idx] = { ...existing, text: existing.text + p.delta };
          } else {
            next.push({ id: p.messageId, kind: 'assistant', text: p.delta });
          }
        } else if (p.type === 'thinking.delta') {
          const thinkId = `think:${p.messageId}`;
          const idx = next.findIndex((i) => i.id === thinkId);
          if (idx >= 0) {
            const existing = next[idx] as Extract<TimelineItem, { kind: 'thinking' }>;
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
          const idx = next.findIndex((i) => i.id === p.callId && i.kind === 'tool');
          if (idx >= 0) {
            const existing = next[idx] as Extract<TimelineItem, { kind: 'tool' }>;
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
        }
      }
      return next;
    });
  }, []);

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
    void loadActiveHost().then(setHost);
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

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
    socket.emit('session:prompt', { sessionId, text, mode });
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
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.modeRow}>
          {MODES.map((m) => (
            <Pressable
              key={m}
              style={[styles.modeChip, mode === m && styles.modeChipActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                {m}
              </Text>
            </Pressable>
          ))}
        </View>
        <StatusBadge status={status} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={84}
      >
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TimelineRow item={item} />}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews
        />

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask your coding agent..."
            placeholderTextColor={colors.textMuted}
            multiline
          />
          {status === 'running' ? (
            <Pressable style={styles.stopBtn} onPress={handleCancel}>
              <Square size={16} color={colors.danger} />
            </Pressable>
          ) : (
            <Pressable style={styles.sendBtn} onPress={handleSend}>
              <Send size={17} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modeRow: { flexDirection: 'row', gap: 6 },
  modeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  modeText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  modeTextActive: { color: colors.accent },
  listContent: { padding: 14, gap: 10 },
  bubble: {
    maxWidth: '92%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  thinkingBox: {
    backgroundColor: 'rgba(142, 155, 181, 0.08)',
    borderLeftWidth: 2,
    borderLeftColor: colors.textMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  thinkingLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  thinkingText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  sendBtn: {
    backgroundColor: colors.accent,
    padding: 12,
    borderRadius: 12,
  },
  stopBtn: {
    backgroundColor: colors.dangerSoft,
    padding: 12,
    borderRadius: 12,
  },
});
