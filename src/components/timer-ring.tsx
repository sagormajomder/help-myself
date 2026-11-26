import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { TimerPhase } from '@/types/focus';
import { formatCountdown } from '@/utils/schedule-calculator';

interface TimerRingProps {
  remainingMs: number;
  progress: number;
  phase: TimerPhase;
  phaseLabel: string;
  subtitleLabel: string;
}

const PHASE_ACCENT: Record<TimerPhase, string> = {
  focusing: '#2563EB',
  resting: '#059669',
  paused: '#D97706',
  awaiting_rest_ack: '#7C3AED',
  awaiting_focus_ack: '#059669',
  outside_range: '#64748B',
  completed_range: '#0D9488',
  inactive: '#64748B',
};

export function TimerRing({
  remainingMs,
  progress,
  phase,
  phaseLabel,
  subtitleLabel,
}: TimerRingProps) {
  const theme = useTheme();
  const accent = PHASE_ACCENT[phase];
  const clampedPct = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <View style={[styles.outerCard, { backgroundColor: theme.backgroundElement }]}>
      <View style={[styles.ringBorder, { borderColor: accent }]}>
        <View style={[styles.badge, { backgroundColor: `${accent}22` }]}>
          <ThemedText style={[styles.badgeText, { color: accent }]}>{phaseLabel}</ThemedText>
        </View>

        <ThemedText style={styles.countdownText}>{formatCountdown(remainingMs)}</ThemedText>

        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          {subtitleLabel}
        </ThemedText>
      </View>

      <View style={styles.progressWrap}>
        <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${clampedPct}%`, backgroundColor: accent },
            ]}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {clampedPct}%
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerCard: {
    width: '100%',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    gap: 16,
  },
  ringBorder: {
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  countdownText: {
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  subtitle: {
    textAlign: 'center',
  },
  progressWrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
});
