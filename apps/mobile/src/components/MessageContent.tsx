import React, { memo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

interface MessageSegment {
  type: 'text' | 'code';
  lang?: string;
  content: string;
}

function parseSegments(raw: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      const text = raw.slice(lastIndex, match.index).trim();
      if (text) segments.push({ type: 'text', content: text });
    }
    segments.push({
      type: 'code',
      lang: match[1] || undefined,
      content: (match[2] ?? '').replace(/\n$/, ''),
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < raw.length) {
    const remaining = raw.slice(lastIndex);
    if (remaining) segments.push({ type: 'text', content: remaining });
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: raw }];
}

export const MessageContent = memo(function MessageContent({
  text,
}: {
  text: string;
}) {
  const segments = parseSegments(text);

  return (
    <View style={styles.container}>
      {segments.map((seg, idx) =>
        seg.type === 'code' ? (
          <View key={idx} style={styles.codeBlock}>
            {seg.lang ? <Text style={styles.codeLang}>{seg.lang}</Text> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={styles.codeText} selectable>
                {seg.content}
              </Text>
            </ScrollView>
          </View>
        ) : (
          <Text key={idx} style={styles.text} selectable>
            {seg.content}
          </Text>
        ),
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 8 },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
  codeBlock: {
    backgroundColor: '#090D14',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  codeLang: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  codeText: {
    color: '#D8E2F4',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 17,
  },
});
