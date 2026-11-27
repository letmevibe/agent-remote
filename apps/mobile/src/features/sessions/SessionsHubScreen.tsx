import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { AgentId, HostInfo, SessionSummary } from '@agent-remote/protocol';
import { Plus, QrCode, Terminal } from 'lucide-react-native';
import { StatusBadge } from '@/components/StatusBadge';
import {
  createSession,
  fetchHostInfo,
  fetchSessions,
} from '@/core/network/apiClient';
import { getBridgeSocket } from '@/core/network/socketClient';
import { loadActiveHost, type SavedHost } from '@/core/storage/hostStore';
import { colors } from '@/theme/colors';

export function SessionsHubScreen() {
  const router = useRouter();
  const [host, setHost] = useState<SavedHost | null>(null);
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const saved = await loadActiveHost();
    setHost(saved);
    if (!saved) {
      setLoading(false);
      return;
    }

    try {
      const [info, list] = await Promise.all([
        fetchHostInfo(saved),
        fetchSessions(saved),
      ]);
      setHostInfo(info);
      setSessions(list);
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

  const handleNewSession = async (agentId: AgentId) => {
    if (!host) return;
    try {
      const created = await createSession(host, { agentId });
      router.push(`/session/${created.id}`);
    } catch (err) {
      Alert.alert(
        'Cannot create session',
        err instanceof Error ? err.message : 'Unknown error',
      );
    }
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
        <Terminal size={42} color={colors.accent} />
        <Text style={styles.emptyTitle}>No Host Paired</Text>
        <Text style={styles.emptySubtitle}>
          Connect your phone to a desktop running Agent Remote Bridge.
        </Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.push('/pair')}
        >
          <QrCode size={18} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>Pair Host</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hostName}>{host.hostName}</Text>
          <Text style={styles.workspace} numberOfLines={1}>
            {host.workspacePath}
          </Text>
        </View>
        <Pressable style={styles.pairMiniBtn} onPress={() => router.push('/pair')}>
          <QrCode size={18} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.quickLaunchRow}>
        {(hostInfo?.agents ?? [
          { id: 'antigravity', name: 'Antigravity', available: true },
          { id: 'codex', name: 'Codex', available: false },
        ]).map((agent) => (
          <Pressable
            key={agent.id}
            style={[
              styles.launchChip,
              !agent.available && styles.launchChipDisabled,
            ]}
            disabled={!agent.available}
            onPress={() => void handleNewSession(agent.id)}
          >
            <Plus size={14} color={agent.available ? colors.accent : colors.textMuted} />
            <Text style={styles.launchChipText}>{agent.name}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
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
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={styles.emptySubtitle}>
              Tap an agent above to start a new mobile coding session.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.sessionCard}
            onPress={() => router.push(`/session/${item.id}`)}
          >
            <View style={styles.sessionRow}>
              <Text style={styles.sessionTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={styles.sessionMeta}>
              {item.agentId} · {item.mode}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  hostName: { color: colors.text, fontSize: 20, fontWeight: '700' },
  workspace: { color: colors.textMuted, fontSize: 12, maxWidth: 270 },
  pairMiniBtn: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
  },
  quickLaunchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  launchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  launchChipDisabled: { opacity: 0.45 },
  launchChipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  listContent: { padding: 16, gap: 10 },
  sessionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sessionTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  sessionMeta: { color: colors.textMuted, fontSize: 12 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyList: { paddingTop: 48, alignItems: 'center' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 8,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
