import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type {
  AgentExecutionMode,
  ModelInfo,
  ProjectInfo,
  SessionSummary,
} from '@agent-remote/protocol';
import {
  ChevronDown,
  Folder,
  FolderPlus,
  ListFilter,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  Terminal,
} from 'lucide-react-native';
import { FloatingComposer } from '@/components/FloatingComposer';
import {
  createSession,
  fetchModels,
  fetchProjects,
  fetchSessions,
} from '@/core/network/apiClient';
import { getBridgeSocket } from '@/core/network/socketClient';
import { loadActiveHost, type SavedHost } from '@/core/storage/hostStore';
import { colors } from '@/theme/colors';

function formatRelativeTime(iso: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function SessionsHubScreen() {
  const router = useRouter();
  const [host, setHost] = useState<SavedHost | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Composer state for instant prompt launch from Home
  const [draft, setDraft] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>();
  const [mode, setMode] = useState<AgentExecutionMode>('auto');

  const loadData = useCallback(async () => {
    const saved = await loadActiveHost();
    setHost(saved);
    if (!saved) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [projectList, sessionList, modelList] = await Promise.all([
        fetchProjects(saved),
        fetchSessions(saved),
        fetchModels(saved).catch(() => []),
      ]);
      setProjects(projectList);
      setSessions(sessionList);
      setModels(modelList);
      if (modelList.length > 0) {
        setSelectedModelId((curr) => curr ?? modelList[0]!.id);
      }
    } catch (err) {
      Alert.alert(
        'Host unreachable',
        err instanceof Error ? err.message : 'Check your Host Bridge connection.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!host) return;
    const socket = getBridgeSocket(host);
    const onUpdated = (updated: SessionSummary) => {
      setSessions((prev) => {
        const exists = prev.some((s) => s.id === updated.id);
        const next = exists
          ? prev.map((s) => (s.id === updated.id ? updated : s))
          : [updated, ...prev];
        return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
    };

    socket.on('session:updated', onUpdated);
    return () => {
      socket.off('session:updated', onUpdated);
    };
  }, [host]);

  const grouped = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filteredSessions = q
      ? sessions.filter((s) => s.title.toLowerCase().includes(q))
      : sessions;

    return projects.map((project) => {
      const list = filteredSessions.filter(
        (s) => s.workspacePath.toLowerCase() === project.path.toLowerCase(),
      );
      return { project, sessions: list };
    });
  }, [projects, sessions, searchQuery]);

  const handleStartSession = async (
    workspacePath?: string,
    initialPrompt?: string,
  ) => {
    if (!host) return;
    try {
      const title = initialPrompt
        ? initialPrompt.slice(0, 48)
        : undefined;
      const created = await createSession(host, {
        agentId: 'antigravity',
        workspacePath: workspacePath ?? host.workspacePath,
        mode,
        model: selectedModelId,
        title,
        initialPrompt,
      });
      router.push(`/session/${created.id}`);
    } catch (err) {
      Alert.alert(
        'Cannot start session',
        err instanceof Error ? err.message : 'Unknown error',
      );
    }
  };

  const handleComposerSubmit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void handleStartSession(host?.workspacePath, text);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
      </SafeAreaView>
    );
  }

  if (!host) {
    return (
      <SafeAreaView style={styles.centered}>
        <Terminal size={44} color={colors.accent} />
        <Text style={styles.emptyTitle}>Agent Remote</Text>
        <Text style={styles.emptySubtitle}>
          Scan the QR code from your desktop Host Bridge to control Antigravity,
          Codex, and ACP coding agents smoothly on mobile.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.push('/pair')}>
          <QrCode size={18} color="#000000" />
          <Text style={styles.primaryBtnText}>Pair Desktop Host</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <View style={styles.brandMark}>
            <Terminal size={16} color={colors.accent} />
          </View>
          <Pressable style={styles.hostPill} onPress={() => router.push('/pair')}>
            <View style={styles.onlineDot} />
            <Text style={styles.hostPillText} numberOfLines={1}>
              {host.hostName}
            </Text>
            <ChevronDown size={14} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.topRight}>
          <Pressable
            style={styles.topIconBtn}
            onPress={() => setSearchOpen((prev) => !prev)}
          >
            <Search size={19} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.topIconBtn}
            onPress={() => router.push('/settings')}
          >
            <Settings size={19} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.topIconBtn}
            onPress={() => {
              setRefreshing(true);
              void loadData();
            }}
          >
            <RefreshCw size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {searchOpen ? (
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Filter conversations..."
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              tintColor={colors.accent}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadData();
              }}
            />
          }
        >
          {/* Projects Section Header */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Projects</Text>
              <ChevronDown size={14} color={colors.textMuted} />
            </View>
            <View style={styles.sectionActions}>
              <Pressable
                style={styles.smallIconBtn}
                onPress={() => setSearchOpen((prev) => !prev)}
              >
                <ListFilter size={17} color={colors.textMuted} />
              </Pressable>
              <Pressable
                style={styles.smallIconBtn}
                onPress={() => router.push('/pair')}
              >
                <FolderPlus size={17} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>

          {/* Project Groups */}
          {grouped.map(({ project, sessions: projSessions }) => {
            const isExpanded = Boolean(expandedProjects[project.id]);
            const visibleSessions = isExpanded
              ? projSessions
              : projSessions.slice(0, 5);

            return (
              <View key={project.id} style={styles.projectGroup}>
                <View style={styles.projectHeader}>
                  <View style={styles.projectTitleRow}>
                    <Folder size={16} color={colors.textMuted} />
                    <Text style={styles.projectName} numberOfLines={1}>
                      {project.name}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.plusBtn}
                    onPress={() => void handleStartSession(project.path)}
                    hitSlop={8}
                  >
                    <Plus size={18} color={colors.textMuted} />
                  </Pressable>
                </View>

                {visibleSessions.length === 0 ? (
                  <Text style={styles.noConvText}>No conversations yet</Text>
                ) : (
                  <View style={styles.convList}>
                    {visibleSessions.map((session) => {
                      const isActive =
                        session.status === 'running' ||
                        session.status === 'waiting_approval';
                      return (
                        <Pressable
                          key={session.id}
                          style={styles.convRow}
                          onPress={() => router.push(`/session/${session.id}`)}
                        >
                          <Text style={styles.convTitle} numberOfLines={1}>
                            {session.title}
                          </Text>
                          {isActive ? (
                            <View style={styles.activeDot} />
                          ) : (
                            <Text style={styles.convTime}>
                              {formatRelativeTime(session.updatedAt)}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}

                    {projSessions.length > 5 ? (
                      <Pressable
                        onPress={() =>
                          setExpandedProjects((prev) => ({
                            ...prev,
                            [project.id]: !isExpanded,
                          }))
                        }
                      >
                        <Text style={styles.seeAllText}>
                          {isExpanded
                            ? 'Show less'
                            : `See all (${projSessions.length})`}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        <FloatingComposer
          value={draft}
          onChangeText={setDraft}
          onSubmit={handleComposerSubmit}
          models={models}
          selectedModelId={selectedModelId}
          onChangeModel={setSelectedModelId}
          mode={mode}
          onChangeMode={setMode}
          onPressPlus={() => void handleStartSession(host.workspacePath)}
          onPressMic={() =>
            Alert.alert('Voice Prompt', 'Voice input will be enabled in the next update.')
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 14,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 145,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.online,
  },
  hostPillText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topIconBtn: {
    padding: 7,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
    fontSize: 14,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  smallIconBtn: {
    padding: 4,
  },
  projectGroup: {
    marginBottom: 20,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  projectTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  projectName: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  plusBtn: {
    padding: 4,
  },
  noConvText: {
    color: colors.textMuted,
    fontSize: 14,
    paddingLeft: 24,
    paddingVertical: 4,
  },
  convList: {
    paddingLeft: 24,
    gap: 14,
  },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 2,
  },
  convTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '400',
  },
  convTime: {
    color: colors.textMuted,
    fontSize: 13,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  seeAllText: {
    color: colors.textMuted,
    fontSize: 14,
    paddingTop: 2,
  },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.text,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 999,
    marginTop: 8,
  },
  primaryBtnText: { color: '#000000', fontWeight: '700', fontSize: 15 },
});
