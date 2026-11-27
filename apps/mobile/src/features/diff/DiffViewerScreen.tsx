import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { GitDiffResponse } from '@agent-remote/protocol';
import { GitBranch } from 'lucide-react-native';
import { fetchWorkspaceDiff } from '@/core/network/apiClient';
import { loadActiveHost } from '@/core/storage/hostStore';
import { colors } from '@/theme/colors';

export function DiffViewerScreen() {
  const [diff, setDiff] = useState<GitDiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const host = await loadActiveHost();
    if (!host) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await fetchWorkspaceDiff(host);
      setDiff(res);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            tintColor={colors.accent}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        <View style={styles.branchRow}>
          <GitBranch size={16} color={colors.accent} />
          <Text style={styles.branchText}>{diff?.branch ?? 'No workspace'}</Text>
          <Text style={styles.countText}>
            {diff?.files.length ?? 0} changed files
          </Text>
        </View>

        {diff?.files.map((file) => (
          <View key={file.path} style={styles.fileChip}>
            <Text style={styles.fileStatus}>{file.status.toUpperCase()}</Text>
            <Text style={styles.filePath} numberOfLines={1}>
              {file.path}
            </Text>
          </View>
        ))}

        {diff?.diff ? (
          <ScrollView horizontal style={styles.diffBox}>
            <View>
              {diff.diff.split('\n').map((line, idx) => {
                const isAdd = line.startsWith('+') && !line.startsWith('+++');
                const isDel = line.startsWith('-') && !line.startsWith('---');
                return (
                  <Text
                    key={idx}
                    style={[
                      styles.diffLine,
                      isAdd && styles.addLine,
                      isDel && styles.delLine,
                    ]}
                  >
                    {line}
                  </Text>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <Text style={styles.emptyText}>Working tree is clean.</Text>
        )}
      </ScrollView>
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
  },
  content: { padding: 16, gap: 10 },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  branchText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  countText: { color: colors.textMuted, fontSize: 13 },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fileStatus: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  filePath: { flex: 1, color: colors.text, fontSize: 13, fontFamily: 'monospace' },
  diffBox: {
    backgroundColor: '#090D14',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 6,
  },
  diffLine: {
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  addLine: { backgroundColor: colors.diffAddBg, color: colors.success },
  delLine: { backgroundColor: colors.diffDelBg, color: colors.danger },
  emptyText: { color: colors.textMuted, fontSize: 14, marginTop: 12 },
});
