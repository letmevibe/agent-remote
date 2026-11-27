import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AgentExecutionMode, ModelInfo } from '@agent-remote/protocol';
import {
  ArrowRight,
  Check,
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
  models: ModelInfo[];
  selectedModelId?: string;
  onChangeModel: (modelId: string) => void;
  mode: AgentExecutionMode;
  onChangeMode: (mode: AgentExecutionMode) => void;
  onPressPlus?: () => void;
  onPressMic?: () => void;
}

const MODES: { id: AgentExecutionMode; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'accept-edits', label: 'Accept Edits' },
  { id: 'auto', label: 'Auto' },
];

function splitModelLabel(label: string): { name: string; tier?: string } {
  const match = label.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (match && match[1] && match[2]) {
    return { name: match[1].trim(), tier: match[2].trim() };
  }
  return { name: label };
}

export function FloatingComposer({
  value,
  onChangeText,
  onSubmit,
  onCancel,
  isRunning = false,
  models,
  selectedModelId,
  onChangeModel,
  mode,
  onChangeMode,
  onPressPlus,
  onPressMic,
}: FloatingComposerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedModel =
    models.find((m) => m.id === selectedModelId) ?? models[0];
  const display = splitModelLabel(selectedModel?.label ?? 'Antigravity Default');
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
              <Text style={styles.modelName} numberOfLines={1}>
                {display.name}
              </Text>
              {display.tier ? (
                <Text style={styles.modelTier}>{display.tier}</Text>
              ) : null}
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

      <Modal visible={pickerOpen} transparent animationType="slide">
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Antigravity Model & Mode</Text>

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

            <Text style={styles.groupLabel}>
              Models from agy CLI ({models.length})
            </Text>
            <ScrollView style={styles.modelList}>
              {models.length === 0 ? (
                <Text style={styles.emptyModels}>
                  No models loaded yet. Pull to refresh or check agy CLI login.
                </Text>
              ) : (
                models.map((m) => {
                  const isSelected = m.id === (selectedModel?.id ?? '');
                  return (
                    <Pressable
                      key={m.id}
                      style={[
                        styles.modelRow,
                        isSelected && styles.modelRowActive,
                      ]}
                      onPress={() => {
                        onChangeModel(m.id);
                        setPickerOpen(false);
                      }}
                    >
                      <View style={styles.modelRowInfo}>
                        <Text style={styles.modelRowLabel}>{m.label}</Text>
                        <Text style={styles.modelRowId}>{m.id}</Text>
                      </View>
                      {isSelected ? (
                        <Check size={16} color={colors.accent} />
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
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
    gap: 8,
    flex: 1,
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
    paddingHorizontal: 4,
    flexShrink: 1,
  },
  modelName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  modelTier: {
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
    maxHeight: '75%',
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
  modelList: {
    maxHeight: 340,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  modelRowActive: {
    backgroundColor: colors.accentSoft,
  },
  modelRowInfo: {
    flex: 1,
    gap: 2,
  },
  modelRowLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  modelRowId: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  emptyModels: {
    color: colors.textMuted,
    fontSize: 13,
    paddingVertical: 12,
  },
});
