import React, { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useFocus } from '@/context/focus-context';
import { useTheme } from '@/hooks/use-theme';
import { formatDurationText } from '@/i18n/translations';
import {
  clearAllSessionLogs,
  getAllTimeTotals,
  getDailyStatsLastNDays,
  getRecentSessionLogs,
} from '@/services/storage-service';
import type { DailyStatsSummary, FocusSessionLog } from '@/types/focus';
import { formatClockTime } from '@/utils/schedule-calculator';

export default function StatsScreen() {
  const safeInsets = useSafeAreaInsets();
  const theme = useTheme();
  const { settings, t, statsRevision, bumpStatsRevision } = useFocus();

  const [daily, setDaily] = useState<DailyStatsSummary[]>([]);
  const [recentLogs, setRecentLogs] = useState<FocusSessionLog[]>([]);
  const [totals, setTotals] = useState({
    totalMinutes: 0,
    totalCycles: 0,
    currentStreakDays: 0,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      const [daysData, logsData, allTimeData] = await Promise.all([
        getDailyStatsLastNDays(7),
        getRecentSessionLogs(25),
        getAllTimeTotals(),
      ]);
      if (!active) return;
      setDaily(daysData);
      setRecentLogs(logsData);
      setTotals(allTimeData);
    })();
    return () => {
      active = false;
    };
  }, [statsRevision]);

  const topPadding = Platform.OS === 'web' ? Spacing.six + 24 : safeInsets.top + Spacing.two;
  const bottomPadding = safeInsets.bottom + BottomTabInset + Spacing.four;

  const todayMinutes = daily.length > 0 ? daily[daily.length - 1].totalFocusMinutes : 0;
  const weekMinutes = daily.reduce((acc, d) => acc + d.totalFocusMinutes, 0);
  const maxDayMinutes = Math.max(60, ...daily.map((d) => d.totalFocusMinutes));

  const handleClear = () => {
    Alert.alert(t.stats.clearHistory, t.stats.clearHistory, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'OK',
        style: 'destructive',
        onPress: async () => {
          await clearAllSessionLogs();
          bumpStatsRevision();
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topPadding, paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          <View style={styles.headerRow}>
            <ThemedText type="subtitle">{t.stats.title}</ThemedText>
            {recentLogs.length > 0 && (
              <Pressable onPress={handleClear}>
                <ThemedText style={{ color: '#DC2626', fontWeight: '600', fontSize: 13 }}>
                  {t.stats.clearHistory}
                </ThemedText>
              </Pressable>
            )}
          </View>

          {/* 4 Summary Cards */}
          <View style={styles.grid}>
            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {t.stats.todayFocus}
              </ThemedText>
              <ThemedText type="subtitle">
                {formatDurationText(todayMinutes, settings.language)}
              </ThemedText>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {t.stats.weekFocus}
              </ThemedText>
              <ThemedText type="subtitle">
                {formatDurationText(weekMinutes, settings.language)}
              </ThemedText>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {t.stats.totalCycles}
              </ThemedText>
              <ThemedText type="subtitle">{totals.totalCycles}</ThemedText>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {t.stats.streak}
              </ThemedText>
              <ThemedText type="subtitle">
                {totals.currentStreakDays} {t.stats.daysUnit}
              </ThemedText>
            </View>
          </View>

          {/* 7-Day Bar Chart */}
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">{t.stats.last7Days}</ThemedText>
            <View style={styles.chartRow}>
              {daily.map((day) => {
                const heightPct = Math.max(
                  6,
                  Math.round((day.totalFocusMinutes / maxDayMinutes) * 100)
                );
                const shortLabel = day.dateKey.slice(5);
                return (
                  <View key={day.dateKey} style={styles.barCol}>
                    <ThemedText style={styles.barValue} themeColor="textSecondary">
                      {day.totalFocusMinutes > 0 ? `${day.totalFocusMinutes}m` : ''}
                    </ThemedText>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${heightPct}%`,
                            backgroundColor:
                              day.totalFocusMinutes > 0 ? '#2563EB' : theme.backgroundSelected,
                          },
                        ]}
                      />
                    </View>
                    <ThemedText style={styles.barLabel} themeColor="textSecondary">
                      {shortLabel}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Recent Logs */}
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">{t.stats.recentSessions}</ThemedText>
            {recentLogs.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t.stats.emptyHistory}
              </ThemedText>
            ) : (
              <View style={styles.logsList}>
                {recentLogs.map((log) => (
                  <View
                    key={log.id}
                    style={[styles.logRow, { backgroundColor: theme.background }]}>
                    <View style={styles.logLeft}>
                      <ThemedText type="smallBold">{log.profileName}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {log.dateKey} · {formatClockTime(log.completedAt)}
                      </ThemedText>
                    </View>
                    <ThemedText style={{ color: '#2563EB', fontWeight: '700' }}>
                      +{formatDurationText(log.focusMinutes, settings.language)}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  card: {
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
    gap: 6,
    paddingTop: 12,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barTrack: {
    width: '70%',
    flex: 1,
    justifyContent: 'flex-end',
    borderRadius: 8,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 8,
  },
  barValue: {
    fontSize: 10,
  },
  barLabel: {
    fontSize: 10,
  },
  logsList: {
    gap: 8,
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
  logLeft: {
    gap: 2,
  },
});
