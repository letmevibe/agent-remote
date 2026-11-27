import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, FileDiff } from 'lucide-react-native';
import { colors } from '@/theme/colors';

interface FilesChangedBarProps {
  fileCount: number;
  additions: number;
  deletions: number;
  onPressReview: () => void;
}

export function FilesChangedBar({
  fileCount,
  additions,
  deletions,
  onPressReview,
}: FilesChangedBarProps) {
  if (fileCount <= 0) return null;

  return (
    <Pressable style={styles.bar} onPress={onPressReview}>
      <View style={styles.left}>
        <Text style={styles.count}>
          {fileCount} {fileCount === 1 ? 'file' : 'files'} changed
        </Text>
        <Text style={styles.add}>+{additions}</Text>
        <Text style={styles.del}>-{deletions}</Text>
        <ChevronRight size={14} color={colors.textMuted} />
      </View>

      <Pressable style={styles.reviewBtn} onPress={onPressReview}>
        <FileDiff size={14} color={colors.textSecondary} />
        <Text style={styles.reviewText}>Review</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    marginTop: 8,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  count: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  add: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  del: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reviewText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
});
