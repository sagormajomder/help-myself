import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlarmModal } from '@/components/alarm-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimerRing } from '@/components/timer-ring';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useFocus } from '@/context/focus-context';
import { useTheme } from '@/hooks/use-theme';
import { formatDurationText } from '@/i18n/translations';
import { formatClockTime, formatMinuteOfDay } from '@/utils/schedule-calculator';

export default function TodayScreen() {
  const safeInsets = useSafeAreaInsets();
  const theme = useTheme();
  const {
    ready,
    settings,
    t,
    profiles,
    activeProfile,
    slots,
    windowStartAt,
    isActiveDay,
    phase,
    currentSlot,
    remainingMs,
    progress,
    todayFocusMinutes,
    completedCyclesToday,
    nextAlarmAt,
    activeAlarm,
    setActiveProfileId,
    pauseTimer,
    resumeTimer,
    startRestFromAck,
    startFocusFromAck,
    skipRest,
    snooze5Min,
    resetDay,
    dismissAlarmModal,
    testAlarm,
  } = useFocus();

  if (!ready) {
    return (
      <ThemedView style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#2563EB" />
      </ThemedView>
    );
  }

  const topPadding = Platform.OS === 'web' ? Spacing.six + 24 : safeInsets.top + Spacing.two;
  const bottomPadding = safeInsets.bottom + BottomTabInset + Spacing.four;

  let subtitleLabel = '';
  if (phase === 'outside_range') {
    if (!isActiveDay) {
      subtitleLabel = t.today.noActiveDay;
    } else if (windowStartAt) {
      subtitleLabel = `${t.today.startsAt}: ${formatClockTime(windowStartAt)}`;
    }
  } else if (nextAlarmAt) {
    subtitleLabel = `${t.today.nextAlarmAt}: ${formatClockTime(nextAlarmAt)}`;
  } else {
    subtitleLabel = t.phases[phase];
  }

  return (
    <ThemedView style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topPadding, paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          {/* Header & Profile Switcher */}
          <View style={styles.headerRow}>
            <View>
              <ThemedText type="subtitle">{t.appName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t.today.timeRange}: {formatMinuteOfDay(activeProfile.startMinuteOfDay)} –{' '}
                {formatMinuteOfDay(activeProfile.endMinuteOfDay)}
              </ThemedText>
            </View>
            <Pressable
              style={[styles.smallChipBtn, { backgroundColor: theme.backgroundElement }]}
              onPress={() => router.push('/schedule')}>
              <ThemedText type="smallBold">{t.today.actions.goToSchedule}</ThemedText>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.profileChipsRow}>
            {profiles.map((profile) => {
              const selected = profile.id === activeProfile.id;
              return (
                <Pressable
                  key={profile.id}
                  onPress={() => void setActiveProfileId(profile.id)}
                  style={[
                    styles.profileChip,
                    {
                      backgroundColor: selected ? '#2563EB' : theme.backgroundElement,
                    },
                  ]}>
                  <ThemedText
                    style={[
                      styles.profileChipText,
                      { color: selected ? '#FFFFFF' : theme.text },
                    ]}>
                    {profile.name} ({profile.focusMinutes}/{profile.restMinutes}m)
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Timer Ring */}
          <TimerRing
            remainingMs={remainingMs}
            progress={progress}
            phase={phase}
            phaseLabel={t.phases[phase]}
            subtitleLabel={subtitleLabel}
          />

          {/* Summary Stat Cards */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {t.today.todayTotalFocus}
              </ThemedText>
              <ThemedText type="subtitle" style={styles.statValue}>
                {formatDurationText(todayFocusMinutes, settings.language)}
              </ThemedText>
            </View>

            <View style={[styles.statCard, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {t.today.cyclesCompleted}
              </ThemedText>
              <ThemedText type="subtitle" style={styles.statValue}>
                {completedCyclesToday}
              </ThemedText>
            </View>
          </View>

          {/* Primary Controls */}
          <View style={styles.controlsWrap}>
            {(phase === 'focusing' || phase === 'resting') && (
              <View style={styles.controlRow}>
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: '#D97706' }]}
                  onPress={() => void pauseTimer()}>
                  <ThemedText style={styles.primaryBtnText}>
                    {t.today.actions.pause}
                  </ThemedText>
                </Pressable>
                {phase === 'resting' && (
                  <Pressable
                    style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                    onPress={() => void skipRest()}>
                    <ThemedText style={styles.secondaryBtnText}>
                      {t.today.actions.skipRest}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            )}

            {phase === 'paused' && (
              <View style={styles.controlRow}>
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: '#2563EB' }]}
                  onPress={() => void resumeTimer()}>
                  <ThemedText style={styles.primaryBtnText}>
                    {t.today.actions.resume}
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                  onPress={() => void resetDay()}>
                  <ThemedText style={styles.secondaryBtnText}>
                    {t.today.actions.resetDay}
                  </ThemedText>
                </Pressable>
              </View>
            )}

            {phase === 'awaiting_rest_ack' && (
              <View style={styles.controlColumn}>
                {activeProfile.restMinutes > 0 && (
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: '#059669' }]}
                    onPress={() => void startRestFromAck()}>
                    <ThemedText style={styles.primaryBtnText}>
                      {t.today.actions.startRest}
                    </ThemedText>
                  </Pressable>
                )}
                <View style={styles.controlRow}>
                  <Pressable
                    style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                    onPress={() => void snooze5Min()}>
                    <ThemedText style={styles.secondaryBtnText}>
                      {t.today.actions.snooze5}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                    onPress={() => void skipRest()}>
                    <ThemedText style={styles.secondaryBtnText}>
                      {t.today.actions.skipRest}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            )}

            {phase === 'awaiting_focus_ack' && (
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: '#2563EB' }]}
                onPress={() => void startFocusFromAck()}>
                <ThemedText style={styles.primaryBtnText}>
                  {t.today.actions.startFocus}
                </ThemedText>
              </Pressable>
            )}

            <View style={styles.controlRow}>
              <Pressable
                style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                onPress={() => void testAlarm()}>
                <ThemedText style={styles.secondaryBtnText}>
                  {t.today.actions.testAlarm}
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                onPress={() => void resetDay()}>
                <ThemedText style={styles.secondaryBtnText}>
                  {t.today.actions.resetDay}
                </ThemedText>
              </Pressable>
            </View>
          </View>

          {/* Today's Timeline */}
          <View style={styles.timelineSection}>
            <ThemedText type="smallBold">{t.today.timelineTitle}</ThemedText>
            <View style={styles.timelineList}>
              {slots.slice(0, 24).map((slot) => {
                const isCurrent = currentSlot?.index === slot.index && phase !== 'outside_range';
                const isFocus = slot.type === 'focus';
                const accent = isFocus ? '#2563EB' : '#059669';
                return (
                  <View
                    key={slot.index}
                    style={[
                      styles.slotRow,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor: isCurrent ? accent : 'transparent',
                        borderWidth: isCurrent ? 2 : 0,
                      },
                    ]}>
                    <View style={[styles.slotDot, { backgroundColor: accent }]} />
                    <View style={styles.slotInfo}>
                      <ThemedText type="smallBold">
                        {isFocus ? t.today.focusLabel : t.today.restLabel} ({slot.durationMinutes}{' '}
                        {t.schedule.minutesUnit})
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatClockTime(slot.startAt)} – {formatClockTime(slot.endAt)}
                      </ThemedText>
                    </View>
                    {isFocus && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatDurationText(slot.cumulativeFocusMinutes, settings.language)}
                      </ThemedText>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>

      <AlarmModal
        alarm={activeAlarm}
        language={settings.language}
        autoContinue={settings.autoContinue}
        t={t}
        onStartRest={() => void startRestFromAck()}
        onStartFocus={() => void startFocusFromAck()}
        onSkipRest={() => void skipRest()}
        onSnooze5={() => void snooze5Min()}
        onDismiss={dismissAlarmModal}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  smallChipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  profileChipsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  profileChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  profileChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  statValue: {
    fontSize: 22,
    lineHeight: 28,
  },
  controlsWrap: {
    gap: 10,
  },
  controlColumn: {
    gap: 10,
  },
  controlRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  timelineSection: {
    gap: 10,
    marginTop: 4,
  },
  timelineList: {
    gap: 8,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    gap: 12,
  },
  slotDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  slotInfo: {
    flex: 1,
    gap: 2,
  },
});
