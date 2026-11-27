import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SessionStatus } from '@agent-remote/protocol';
import { colors } from '@/theme/colors';

const STATUS_META: Record<
  SessionStatus,
  { label: string; bg: string; fg: string }
> = {
  idle: { label: 'Idle', bg: colors.surfaceElevated, fg: colors.textMuted },
  running: { label: 'Running', bg: colors.accentSoft, fg: colors.accent },
  waiting_approval: {
    label: 'Approval',
    bg: colors.warningSoft,
    fg: colors.warning,
  },
  error: { label: 'Error', bg: colors.dangerSoft, fg: colors.danger },
  closed: { label: 'Closed', bg: colors.surfaceElevated, fg: colors.textMuted },
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const meta = STATUS_META[status];
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <Text style={[styles.label, { color: meta.fg }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
