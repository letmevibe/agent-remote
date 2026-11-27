import React, { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react-native';
import { colors } from '@/theme/colors';

export interface ToolCallCardProps {
  toolName: string;
  summary: string;
  outputPreview?: string;
  ok?: boolean;
}

export const ToolCallCard = memo(function ToolCallCard({
  toolName,
  summary,
  outputPreview,
  ok,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.header}
        onPress={() => setExpanded((prev) => !prev)}
      >
        <Terminal size={14} color={colors.accent} />
        <Text style={styles.title} numberOfLines={1}>
          {toolName}: {summary}
        </Text>
        {ok !== undefined && (
          <Text
            style={[
              styles.resultTag,
              { color: ok ? colors.success : colors.danger },
            ]}
          >
            {ok ? 'OK' : 'ERR'}
          </Text>
        )}
        {expanded ? (
          <ChevronDown size={16} color={colors.textMuted} />
        ) : (
          <ChevronRight size={16} color={colors.textMuted} />
        )}
      </Pressable>
      {expanded && outputPreview ? (
        <View style={styles.body}>
          <Text style={styles.output}>{outputPreview}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    marginVertical: 4,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  resultTag: {
    fontSize: 11,
    fontWeight: '700',
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 10,
    backgroundColor: '#090D14',
  },
  output: {
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 17,
  },
});
