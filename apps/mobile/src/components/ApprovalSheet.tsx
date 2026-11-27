import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  PermissionDecision,
  PermissionRequestPayload,
} from '@agent-remote/protocol';
import { ShieldAlert } from 'lucide-react-native';
import { colors } from '@/theme/colors';

interface ApprovalSheetProps {
  request: PermissionRequestPayload | null;
  onDecide: (decision: PermissionDecision) => void;
}

export function ApprovalSheet({ request, onDecide }: ApprovalSheetProps) {
  if (!request) return null;

  return (
    <Modal visible transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <ShieldAlert size={20} color={colors.warning} />
            <Text style={styles.title}>Approval Required</Text>
          </View>
          <Text style={styles.toolName}>{request.toolName}</Text>
          <Text style={styles.summary}>{request.summary}</Text>

          {request.command ? (
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{request.command}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.denyBtn]}
              onPress={() => onDecide('deny')}
            >
              <Text style={styles.denyText}>Deny</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.allowBtn]}
              onPress={() => onDecide('allow_once')}
            >
              <Text style={styles.allowText}>Allow Once</Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.sessionBtn}
            onPress={() => onDecide('allow_session')}
          >
            <Text style={styles.sessionBtnText}>Allow for this session</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  toolName: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  summary: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  codeBox: {
    backgroundColor: '#090D14',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  codeText: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  denyBtn: {
    backgroundColor: colors.dangerSoft,
  },
  denyText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 14,
  },
  allowBtn: {
    backgroundColor: colors.accent,
  },
  allowText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  sessionBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  sessionBtnText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
