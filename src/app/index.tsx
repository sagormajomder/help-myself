import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlarmModal } from '@/components/alarm-modal';
import { SettingsButton } from '@/components/settings-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimerRing } from '@/components/timer-ring';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useFocus } from '@/context/focus-context';
import { useTheme } from '@/hooks/use-theme';
import { formatDurationText } from '@/i18n/translations';
import {
  findSlotAtTime,
  formatClockTime,
  formatMinuteOfDay,
} from '@/utils/schedule-calculator';

const INDIVIDUAL_PRESETS = [5, 10, 15, 25, 30, 45, 60];

export default function TodayScreen() {
  const safeInsets = useSafeAreaInsets();
  const theme = useTheme();
  const {
    ready,
    nowMs,
    settings,
    t,
    timerMode,
    individualTimer,
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
    setTimerMode,
    setIndividualDuration,
    startIndividualTimer,
    setActiveProfileId,
    startFocus,
    stopFocus,
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

  const [durationDraft, setDurationDraft] = useState<string | null>(null);
  const durationText = durationDraft ?? String(individualTimer.durationMinutes);

  if (!ready) {
    return (
      <ThemedView style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#2563EB" />
      </ThemedView>
    );
  }

  const topPadding = Platform.OS === 'web' ? Spacing.six + 24 : safeInsets.top + Spacing.two;
  const bottomPadding = safeInsets.bottom + BottomTabInset + Spacing.four;

  const handleDurationTextChange = (text: string) => {
    const digitsOnly = text.replace(/[^0-9]/g, '');
    setDurationDraft(digitsOnly);
    const parsed = Number.parseInt(digitsOnly, 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 720) {
      void setIndividualDuration(parsed);
    }
  };

  const handleStartIndividual = () => {
    const parsed = Number.parseInt(durationText, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 720) {
      Alert.alert(t.appName, t.today.individualTimer.invalidDuration);
      return;
    }
    setDurationDraft(null);
    void startIndividualTimer(parsed);
  };

  let phaseLabel = t.phases[phase];
  let subtitleLabel = '';

  if (timerMode === 'individual') {
    if (phase === 'completed_range') {
      phaseLabel = t.today.individualTimer.completedPhase;
      subtitleLabel = t.today.individualTimer.completedSubtitle;
    } else if (phase === 'inactive') {
      subtitleLabel = t.today.individualTimer.readySubtitle;
    } else if (nextAlarmAt) {
      subtitleLabel = `${t.today.nextAlarmAt}: ${formatClockTime(nextAlarmAt)}`;
    } else {
      subtitleLabel = t.phases[phase];
    }
  } else if (phase === 'inactive') {
    if (!isActiveDay) {
      subtitleLabel = t.today.noActiveDay;
    } else if (findSlotAtTime(slots, nowMs, 0)) {
      subtitleLabel = t.today.readyInRange;
    } else if (windowStartAt) {
      subtitleLabel = `${t.today.startsAt}: ${formatClockTime(windowStartAt)}`;
    }
  } else if (phase === 'outside_range') {
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

  const parsedIndividualMinutes = Number.parseInt(durationText, 10);
  const previewMinutes =
    Number.isFinite(parsedIndividualMinutes) && parsedIndividualMinutes >= 1
      ? parsedIndividualMinutes
      : individualTimer.durationMinutes;
  const previewStartAt =
    individualTimer.status === 'running' && individualTimer.startedAt
      ? individualTimer.startedAt
      : nowMs;
  const previewEndAt =
    individualTimer.status === 'running' && individualTimer.endAt
      ? individualTimer.endAt
      : individualTimer.status === 'paused'
        ? nowMs + remainingMs
        : nowMs + previewMinutes * 60_000;

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
            <View style={styles.headerTextWrap}>
              <ThemedText type="subtitle">{t.appName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {timerMode === 'individual'
                  ? t.today.individualTimer.headerSubtitle
                  : `${t.today.timeRange}: ${formatMinuteOfDay(activeProfile.startMinuteOfDay)} – ${formatMinuteOfDay(activeProfile.endMinuteOfDay)}`}
              </ThemedText>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                style={[styles.smallChipBtn, { backgroundColor: theme.backgroundElement }]}
                onPress={() => router.push('/schedule')}>
                <ThemedText type="smallBold">{t.today.actions.goToSchedule}</ThemedText>
              </Pressable>
              <SettingsButton />
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.profileChipsRow}>
            <Pressable
              onPress={() => void setTimerMode('individual')}
              style={[
                styles.profileChip,
                {
                  backgroundColor:
                    timerMode === 'individual' ? '#2563EB' : theme.backgroundElement,
                },
              ]}>
              <ThemedText
                style={[
                  styles.profileChipText,
                  { color: timerMode === 'individual' ? '#FFFFFF' : theme.text },
                ]}>
                ⏱ {t.today.individualTimer.chipLabel}
              </ThemedText>
            </Pressable>
            {profiles.map((profile) => {
              const selected = timerMode === 'profile' && profile.id === activeProfile.id;
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
            phaseLabel={phaseLabel}
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

          {/* Individual Timer Duration Setup (no profile needed, no rest option) */}
          {timerMode === 'individual' &&
            (phase === 'inactive' || phase === 'completed_range') && (
              <View style={[styles.quickCard, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">{t.today.individualTimer.durationTitle}</ThemedText>
                <View style={styles.presetsRow}>
                  {INDIVIDUAL_PRESETS.map((mins) => {
                    const selected = durationText === String(mins);
                    return (
                      <Pressable
                        key={mins}
                        onPress={() => {
                          setDurationDraft(null);
                          void setIndividualDuration(mins);
                        }}
                        style={[
                          styles.presetChip,
                          {
                            backgroundColor: selected ? '#2563EB' : theme.backgroundSelected,
                          },
                        ]}>
                        <ThemedText
                          style={[
                            styles.presetChipText,
                            { color: selected ? '#FFFFFF' : theme.text },
                          ]}>
                          {mins} {t.schedule.minutesUnit}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                  <TextInput
                    value={durationText}
                    onChangeText={handleDurationTextChange}
                    keyboardType="number-pad"
                    maxLength={3}
                    placeholder={t.schedule.customMinutes}
                    placeholderTextColor={theme.textSecondary}
                    style={[
                      styles.durationInput,
                      { color: theme.text, backgroundColor: theme.background },
                    ]}
                  />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {t.today.individualTimer.noRestHint}
                </ThemedText>
              </View>
            )}

          {/* Primary Controls */}
          {timerMode === 'individual' ? (
            <View style={styles.controlsWrap}>
              {(phase === 'inactive' || phase === 'completed_range') && (
                <>
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: '#2563EB' }]}
                    onPress={handleStartIndividual}>
                    <ThemedText style={styles.primaryBtnText}>
                      {t.today.individualTimer.startButton}
                    </ThemedText>
                  </Pressable>
                  <View style={styles.controlRow}>
                    <Pressable
                      style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                      onPress={() => void testAlarm()}>
                      <ThemedText style={styles.secondaryBtnText}>
                        {t.today.actions.testAlarm}
                      </ThemedText>
                    </Pressable>
                    {(todayFocusMinutes > 0 || completedCyclesToday > 0) && (
                      <Pressable
                        style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                        onPress={() => void resetDay()}>
                        <ThemedText style={styles.secondaryBtnText}>
                          {t.today.actions.resetDay}
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                </>
              )}

              {phase === 'focusing' && (
                <View style={styles.controlRow}>
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: '#D97706' }]}
                    onPress={() => void pauseTimer()}>
                    <ThemedText style={styles.primaryBtnText}>
                      {t.today.actions.pause}
                    </ThemedText>
                  </Pressable>
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
                    style={[styles.secondaryBtn, { backgroundColor: '#DC262622' }]}
                    onPress={() => void stopFocus()}>
                    <ThemedText style={[styles.secondaryBtnText, { color: '#DC2626' }]}>
                      {t.today.individualTimer.stopButton}
                    </ThemedText>
                  </Pressable>
                </View>
              )}

              {(phase === 'focusing' || phase === 'paused') && (
                <View style={styles.controlRow}>
                  {phase !== 'paused' && (
                    <Pressable
                      style={[styles.secondaryBtn, { backgroundColor: '#DC262622' }]}
                      onPress={() => void stopFocus()}>
                      <ThemedText style={[styles.secondaryBtnText, { color: '#DC2626' }]}>
                        {t.today.individualTimer.stopButton}
                      </ThemedText>
                    </Pressable>
                  )}
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
              )}
            </View>
          ) : (
            <View style={styles.controlsWrap}>
              {phase === 'inactive' && (
                <>
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: '#2563EB' }]}
                    onPress={() => void startFocus()}>
                    <ThemedText style={styles.primaryBtnText}>
                      {t.today.actions.startFocus}
                    </ThemedText>
                  </Pressable>
                  <View style={styles.controlRow}>
                    <Pressable
                      style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                      onPress={() => router.push('/schedule')}>
                      <ThemedText style={styles.secondaryBtnText}>
                        {t.today.actions.createCustom}
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                      onPress={() => void testAlarm()}>
                      <ThemedText style={styles.secondaryBtnText}>
                        {t.today.actions.testAlarm}
                      </ThemedText>
                    </Pressable>
                    {(todayFocusMinutes > 0 || completedCyclesToday > 0) && (
                      <Pressable
                        style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                        onPress={() => void resetDay()}>
                        <ThemedText style={styles.secondaryBtnText}>
                          {t.today.actions.resetDay}
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                </>
              )}

              {phase === 'outside_range' && (
                <View style={styles.controlRow}>
                  <Pressable
                    style={[styles.secondaryBtn, { backgroundColor: '#DC262622' }]}
                    onPress={() => void stopFocus()}>
                    <ThemedText style={[styles.secondaryBtnText, { color: '#DC2626' }]}>
                      {t.today.actions.stopFocus}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                    onPress={() => void testAlarm()}>
                    <ThemedText style={styles.secondaryBtnText}>
                      {t.today.actions.testAlarm}
                    </ThemedText>
                  </Pressable>
                </View>
              )}

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
                    style={[styles.secondaryBtn, { backgroundColor: '#DC262622' }]}
                    onPress={() => void stopFocus()}>
                    <ThemedText style={[styles.secondaryBtnText, { color: '#DC2626' }]}>
                      {t.today.actions.stopFocus}
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
                    {activeProfile.restMinutes > 0 && (
                      <Pressable
                        style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                        onPress={() => void skipRest()}>
                        <ThemedText style={styles.secondaryBtnText}>
                          {t.today.actions.skipRest}
                        </ThemedText>
                      </Pressable>
                    )}
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

              {phase !== 'inactive' && phase !== 'outside_range' && (
                <View style={styles.controlRow}>
                  {phase !== 'paused' && phase !== 'completed_range' && (
                    <Pressable
                      style={[styles.secondaryBtn, { backgroundColor: '#DC262622' }]}
                      onPress={() => void stopFocus()}>
                      <ThemedText style={[styles.secondaryBtnText, { color: '#DC2626' }]}>
                        {t.today.actions.stopFocus}
                      </ThemedText>
                    </Pressable>
                  )}
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
              )}
            </View>
          )}

          {/* Today's Timeline / Individual Session Preview */}
          {timerMode === 'individual' ? (
            <View style={styles.timelineSection}>
              <ThemedText type="smallBold">{t.today.individualTimer.sessionTitle}</ThemedText>
              <View
                style={[
                  styles.slotRow,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor:
                      phase === 'focusing' || phase === 'paused' ? '#2563EB' : 'transparent',
                    borderWidth: phase === 'focusing' || phase === 'paused' ? 2 : 0,
                  },
                ]}>
                <View style={[styles.slotDot, { backgroundColor: '#2563EB' }]} />
                <View style={styles.slotInfo}>
                  <ThemedText type="smallBold">
                    {t.today.focusLabel} ({previewMinutes} {t.schedule.minutesUnit})
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatClockTime(previewStartAt)} – {formatClockTime(previewEndAt)}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDurationText(previewMinutes, settings.language)}
                </ThemedText>
              </View>
            </View>
          ) : (
            <View style={styles.timelineSection}>
              <ThemedText type="smallBold">{t.today.timelineTitle}</ThemedText>
              <View style={styles.timelineList}>
                {slots.slice(0, 24).map((slot) => {
                  const isCurrent =
                    currentSlot?.index === slot.index &&
                    phase !== 'outside_range' &&
                    phase !== 'inactive' &&
                    phase !== 'completed_range';
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
          )}
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
  headerTextWrap: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  quickCard: {
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  durationInput: {
    minWidth: 96,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    fontSize: 14,
    textAlign: 'center',
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
