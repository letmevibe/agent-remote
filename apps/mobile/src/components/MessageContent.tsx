import React, { memo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

interface MessageSegment {
  type: 'text' | 'code';
  lang?: string;
  content: string;
}

function parseFencedBlocks(raw: string): MessageSegment[] {
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
    const remaining = raw.slice(lastIndex).trim();
    if (remaining) segments.push({ type: 'text', content: remaining });
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: raw }];
}

function renderInlineMarkdown(line: string, keyPrefix: string) {
  const tokens = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <Text key={`${keyPrefix}-${idx}`} style={styles.inlineCode}>
          {' '}
          {token.slice(1, -1)}{' '}
        </Text>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <Text key={`${keyPrefix}-${idx}`} style={styles.bold}>
          {token.slice(2, -2)}
        </Text>
      );
    }
    return <Text key={`${keyPrefix}-${idx}`}>{token}</Text>;
  });
}

function RichTextBlock({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <View style={styles.linesWrap}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <View key={idx} style={styles.spacer} />;
        }

        if (/^#{1,3}\s+/.test(trimmed)) {
          const heading = trimmed.replace(/^#{1,3}\s+/, '');
          return (
            <Text key={idx} style={styles.heading} selectable>
              {heading}
            </Text>
          );
        }

        if (/^[-*]\s+/.test(trimmed)) {
          const bulletText = trimmed.replace(/^[-*]\s+/, '');
          return (
            <View key={idx} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.text} selectable>
                {renderInlineMarkdown(bulletText, `b-${idx}`)}
              </Text>
            </View>
          );
        }

        return (
          <Text key={idx} style={styles.text} selectable>
            {renderInlineMarkdown(line, `p-${idx}`)}
          </Text>
        );
      })}
    </View>
  );
}

export const MessageContent = memo(function MessageContent({
  text,
}: {
  text: string;
}) {
  const segments = parseFencedBlocks(text);

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
          <RichTextBlock key={idx} content={seg.content} />
        ),
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 10 },
  linesWrap: { gap: 4 },
  spacer: { height: 6 },
  heading: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 2,
  },
  text: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
  },
  bold: {
    fontWeight: '700',
    color: colors.text,
  },
  inlineCode: {
    backgroundColor: '#191920',
    color: '#E2E8F0',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: 4,
  },
  bulletDot: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
  },
  codeBlock: {
    backgroundColor: '#0E0E12',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
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
    lineHeight: 18,
  },
});
