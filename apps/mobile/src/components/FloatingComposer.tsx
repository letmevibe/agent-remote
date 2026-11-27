import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  AgentExecutionMode,
  AgentId,
  ReasoningEffort,
} from '@agent-remote/protocol';
import {
  ArrowRight,
  ChevronDown,
  Gauge,
  Mic,
  Plus,
  Square,
} from 'lucide-react-native';
import { colors } from '@/theme/colors';

interface FloatingComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  isRunning?: boolean;
  agentId: AgentId;
  onChangeAgent: (agentId: AgentId) => void;
  effort: ReasoningEffort;
  onChangeEffort: (effort: ReasoningEffort) => void;
  mode: AgentExecutionMode;
  onChangeMode: (mode: AgentExecutionMode) => void;
  onPressPlus?: () => void;
  onPressMic?: () => void;
}

const AGENTS: { id: AgentId; label: string }[] = [
  { id: 'antigravity', label: 'Antigravity' },
  { id: 'codex', label: 'Codex' },
];

const EFFORTS: { id: ReasoningEffort; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

const MODES: { id: AgentExecutionMode; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'accept-edits', label: 'Accept Edits' },
  { id: 'auto', label: 'Auto' },
];

export function FloatingComposer({
  value,
  onChangeText,
  onSubmit,
  onCancel,
  isRunning = false,
  agentId,
  onChangeAgent,
  effort,
  onChangeEffort,
  mode,
  onChangeMode,
  onPressPlus,
  onPressMic,
}: FloatingComposerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const agentLabel =
    AGENTS.find((a) => a.id === agentId)?.label ?? String(agentId);
  const effortLabel =
    EFFORTS.find((e) => e.id === effort)?.label ?? effort;
  const canSend = value.trim().length > 0;

  return (
    <View style={styles.outerWrap}>
      <View style={styles.pill}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder="Ask anything, @ to mention, / for actions"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={4000}
        />

        <View style={styles.toolbar}>
          <View style={styles.leftTools}>
            <Pressable style={styles.iconBtn} onPress={onPressPlus} hitSlop={8}>
              <Plus size={18} color={colors.textMuted} />
            </Pressable>

            <Pressable
              style={styles.selectorBtn}
              onPress={() => setPickerOpen(true)}
            >
              <Text style={styles.agentText}>{agentLabel}</Text>
              <Text style={styles.effortText}>{effortLabel}</Text>
              <Gauge size={14} color={colors.warning} />
              <ChevronDown size={14} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.rightTools}>
            <Pressable style={styles.iconBtn} onPress={onPressMic} hitSlop={8}>
              <Mic size={17} color={colors.textMuted} />
            </Pressable>

            {isRunning ? (
              <Pressable style={styles.stopCircle} onPress={onCancel}>
                <Square size={13} color={colors.danger} fill={colors.danger} />
              </Pressable>
            ) : (
              <Pressable
                style={[styles.sendCircle, canSend && styles.sendCircleActive]}
                onPress={onSubmit}
                disabled={!canSend}
              >
                <ArrowRight
                  size={17}
                  color={canSend ? '#000000' : colors.textMuted}
                />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <Modal visible={pickerOpen} transparent animationType="fade">
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Agent & Execution</Text>

            <Text style={styles.groupLabel}>Agent</Text>
            <View style={styles.chipRow}>
              {AGENTS.map((item) => (
                <Pressable
                  key={item.id}
                  style={[
                    styles.chip,
                    agentId === item.id && styles.chipActive,
                  ]}
                  onPress={() => onChangeAgent(item.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      agentId === item.id && styles.chipTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.groupLabel}>Reasoning Effort</Text>
            <View style={styles.chipRow}>
              {EFFORTS.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.chip, effort === item.id && styles.chipActive]}
                  onPress={() => onChangeEffort(item.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      effort === item.id && styles.chipTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.groupLabel}>Permission Mode</Text>
            <View style={styles.chipRow}>
              {MODES.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.chip, mode === item.id && styles.chipActive]}
                  onPress={() => onChangeMode(item.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      mode === item.id && styles.chipTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={styles.doneBtn}
              onPress={() => setPickerOpen(false)}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
    backgroundColor: colors.bg,
  },
  pill: {
    backgroundColor: colors.composerBg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  input: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    maxHeight: 110,
    padding: 0,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rightTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    padding: 4,
  },
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  agentText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  effortText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  sendCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#26262C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendCircleActive: {
    backgroundColor: colors.text,
  },
  stopCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  groupLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.text,
  },
  doneBtn: {
    marginTop: 8,
    backgroundColor: colors.text,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
});
