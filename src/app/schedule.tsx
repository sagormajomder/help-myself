import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useFocus } from '@/context/focus-context';
import { useTheme } from '@/hooks/use-theme';
import {
  ensureNotificationPermissions,
  requestExactAlarmPermission,
} from '@/services/notification-service';
import type { FocusProfile } from '@/types/focus';
import { formatMinuteOfDay } from '@/utils/schedule-calculator';

const FOCUS_PRESETS = [25, 30, 45, 60, 90];
const REST_PRESETS = [0, 5, 10, 15];

function minuteToDate(minuteOfDay: number): Date {
  const d = new Date();
  d.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
  return d;
}

export default function ScheduleScreen() {
  const safeInsets = useSafeAreaInsets();
  const theme = useTheme();
  const {
    settings,
    t,
    profiles,
    activeProfile,
    updateSettings,
    saveProfile,
    setActiveProfileId,
    deleteProfile,
  } = useFocus();

  const [editingId, setEditingId] = useState(activeProfile.id);
  const [name, setName] = useState(activeProfile.name);
  const [startMinute, setStartMinute] = useState(activeProfile.startMinuteOfDay);
  const [endMinute, setEndMinute] = useState(activeProfile.endMinuteOfDay);
  const [focusText, setFocusText] = useState(String(activeProfile.focusMinutes));
  const [restText, setRestText] = useState(String(activeProfile.restMinutes));
  const [activeDays, setActiveDays] = useState<number[]>(activeProfile.activeDays);

  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [exactAlarmOk, setExactAlarmOk] = useState(true);

  const populateFormFromProfile = (selected: FocusProfile) => {
    setEditingId(selected.id);
    setName(selected.name);
    setStartMinute(selected.startMinuteOfDay);
    setEndMinute(selected.endMinuteOfDay);
    setFocusText(String(selected.focusMinutes));
    setRestText(String(selected.restMinutes));
    setActiveDays(selected.activeDays);
  };

  useEffect(() => {
    void ensureNotificationPermissions().then((res) => {
      setExactAlarmOk(res.exactAlarmGranted);
    });
  }, []);

  const topPadding = Platform.OS === 'web' ? Spacing.six + 24 : safeInsets.top + Spacing.two;
  const bottomPadding = safeInsets.bottom + BottomTabInset + Spacing.four;

  const isOvernight = endMinute <= startMinute;

  const handleCreateNewProfile = () => {
    const newId = `profile-${Date.now()}`;
    const newProfile: FocusProfile = {
      id: newId,
      name: `${t.schedule.newProfileDefault} ${profiles.length + 1}`,
      startMinuteOfDay: 9 * 60,
      endMinuteOfDay: 17 * 60,
      focusMinutes: 45,
      restMinutes: 5,
      activeDays: [0, 1, 2, 3, 4],
      isActive: true,
    };
    populateFormFromProfile(newProfile);
    void saveProfile(newProfile);
  };

  const handleTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setPickerTarget(null);
    }
    if (event.type === 'dismissed' || !selectedDate || !pickerTarget) return;
    const mins = selectedDate.getHours() * 60 + selectedDate.getMinutes();
    if (pickerTarget === 'start') {
      setStartMinute(mins);
    } else {
      setEndMinute(mins);
    }
  };

  const adjustTimeStep = (target: 'start' | 'end', deltaMinutes: number) => {
    const normalize = (val: number) => ((val % 1440) + 1440) % 1440;
    if (target === 'start') {
      setStartMinute((prev) => normalize(prev + deltaMinutes));
    } else {
      setEndMinute((prev) => normalize(prev + deltaMinutes));
    }
  };

  const toggleDay = (dayIndex: number) => {
    setActiveDays((prev) => {
      if (prev.includes(dayIndex)) {
        return prev.length > 1 ? prev.filter((d) => d !== dayIndex) : prev;
      }
      return [...prev, dayIndex].sort((a, b) => a - b);
    });
  };

  const handleSave = async () => {
    const focusNum = Number.parseInt(focusText, 10);
    const restNum = Number.parseInt(restText, 10);

    if (!Number.isFinite(focusNum) || focusNum < 1 || !Number.isFinite(restNum) || restNum < 0) {
      Alert.alert(t.appName, t.schedule.validationError);
      return;
    }

    const trimmedName = name.trim() || t.schedule.newProfileDefault;
    await saveProfile({
      id: editingId,
      name: trimmedName,
      startMinuteOfDay: startMinute,
      endMinuteOfDay: endMinute,
      focusMinutes: focusNum,
      restMinutes: restNum,
      activeDays,
      isActive: true,
    });

    setFeedbackMsg(t.schedule.savedToast);
    setTimeout(() => setFeedbackMsg(null), 3000);
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
          <ThemedText type="subtitle">{t.schedule.title}</ThemedText>

          {/* Profiles Section */}
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.cardHeader}>
              <ThemedText type="smallBold">{t.schedule.profilesTitle}</ThemedText>
              <Pressable onPress={handleCreateNewProfile}>
                <ThemedText style={styles.linkAction}>{t.schedule.addProfile}</ThemedText>
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}>
              {profiles.map((p) => {
                const isSelected = p.id === editingId;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      populateFormFromProfile(p);
                      void setActiveProfileId(p.id);
                    }}
                    style={[
                      styles.chip,
                      { backgroundColor: isSelected ? '#2563EB' : theme.backgroundSelected },
                    ]}>
                    <ThemedText
                      style={{ color: isSelected ? '#FFFFFF' : theme.text, fontWeight: '600' }}>
                      {p.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t.schedule.profileName}
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.textInput,
                  { color: theme.text, backgroundColor: theme.background },
                ]}
              />
              {profiles.length > 1 && (
                <Pressable
                  style={[styles.deleteBtn, { backgroundColor: '#DC262622' }]}
                  onPress={() => {
                    const fallback = profiles.find((p) => p.id !== editingId);
                    if (fallback) {
                      populateFormFromProfile(fallback);
                    }
                    void deleteProfile(editingId);
                  }}>
                  <ThemedText style={{ color: '#DC2626', fontWeight: '700' }}>
                    {t.schedule.deleteProfile}
                  </ThemedText>
                </Pressable>
              )}
            </View>
          </View>

          {/* Time Range Picker */}
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">{t.schedule.timeRangeTitle}</ThemedText>

            <View style={styles.timeRow}>
              <View style={[styles.timeBox, { backgroundColor: theme.background }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t.schedule.startTime}
                </ThemedText>
                <Pressable onPress={() => setPickerTarget('start')}>
                  <ThemedText type="subtitle">{formatMinuteOfDay(startMinute)}</ThemedText>
                </Pressable>
                {Platform.OS === 'web' && (
                  <View style={styles.stepperRow}>
                    <Pressable onPress={() => adjustTimeStep('start', -15)}>
                      <ThemedText type="smallBold">-15m</ThemedText>
                    </Pressable>
                    <Pressable onPress={() => adjustTimeStep('start', 15)}>
                      <ThemedText type="smallBold">+15m</ThemedText>
                    </Pressable>
                  </View>
                )}
              </View>

              <View style={[styles.timeBox, { backgroundColor: theme.background }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t.schedule.endTime}
                </ThemedText>
                <Pressable onPress={() => setPickerTarget('end')}>
                  <ThemedText type="subtitle">{formatMinuteOfDay(endMinute)}</ThemedText>
                </Pressable>
                {Platform.OS === 'web' && (
                  <View style={styles.stepperRow}>
                    <Pressable onPress={() => adjustTimeStep('end', -15)}>
                      <ThemedText type="smallBold">-15m</ThemedText>
                    </Pressable>
                    <Pressable onPress={() => adjustTimeStep('end', 15)}>
                      <ThemedText type="smallBold">+15m</ThemedText>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>

            {isOvernight && (
              <ThemedText type="small" style={{ color: '#2563EB' }}>
                {t.schedule.overnightHint}
              </ThemedText>
            )}

            {pickerTarget && Platform.OS !== 'web' && (
              <View style={styles.pickerWrap}>
                <DateTimePicker
                  mode="time"
                  value={minuteToDate(pickerTarget === 'start' ? startMinute : endMinute)}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleTimeChange}
                />
                {Platform.OS === 'ios' && (
                  <Pressable onPress={() => setPickerTarget(null)} style={styles.doneBtn}>
                    <ThemedText style={styles.linkAction}>Done</ThemedText>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {/* Focus Interval & Rest Duration */}
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">{t.schedule.focusIntervalTitle}</ThemedText>
            <View style={styles.presetsRow}>
              {FOCUS_PRESETS.map((mins) => {
                const selected = focusText === String(mins);
                return (
                  <Pressable
                    key={mins}
                    onPress={() => setFocusText(String(mins))}
                    style={[
                      styles.chip,
                      { backgroundColor: selected ? '#2563EB' : theme.backgroundSelected },
                    ]}>
                    <ThemedText style={{ color: selected ? '#FFFFFF' : theme.text }}>
                      {mins} {t.schedule.minutesUnit}
                    </ThemedText>
                  </Pressable>
                );
              })}
              <TextInput
                value={focusText}
                onChangeText={setFocusText}
                keyboardType="number-pad"
                placeholder={t.schedule.customMinutes}
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.smallInput,
                  { color: theme.text, backgroundColor: theme.background },
                ]}
              />
            </View>

            <ThemedText type="smallBold" style={{ marginTop: 8 }}>
              {t.schedule.restDurationTitle}
            </ThemedText>
            <View style={styles.presetsRow}>
              {REST_PRESETS.map((mins) => {
                const selected = restText === String(mins);
                return (
                  <Pressable
                    key={mins}
                    onPress={() => setRestText(String(mins))}
                    style={[
                      styles.chip,
                      { backgroundColor: selected ? '#059669' : theme.backgroundSelected },
                    ]}>
                    <ThemedText style={{ color: selected ? '#FFFFFF' : theme.text }}>
                      {mins} {t.schedule.minutesUnit}
                    </ThemedText>
                  </Pressable>
                );
              })}
              <TextInput
                value={restText}
                onChangeText={setRestText}
                keyboardType="number-pad"
                placeholder={t.schedule.customMinutes}
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.smallInput,
                  { color: theme.text, backgroundColor: theme.background },
                ]}
              />
            </View>

            <ThemedText type="smallBold" style={{ marginTop: 8 }}>
              {t.schedule.activeDaysTitle}
            </ThemedText>
            <View style={styles.daysRow}>
              {t.schedule.daysShort.map((label, idx) => {
                const selected = activeDays.includes(idx);
                return (
                  <Pressable
                    key={idx}
                    onPress={() => toggleDay(idx)}
                    style={[
                      styles.dayBtn,
                      { backgroundColor: selected ? '#2563EB' : theme.backgroundSelected },
                    ]}>
                    <ThemedText
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: selected ? '#FFFFFF' : theme.text,
                      }}>
                      {label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            style={[styles.saveBtn, { backgroundColor: '#2563EB' }]}
            onPress={() => void handleSave()}>
            <ThemedText style={styles.saveBtnText}>{t.schedule.saveButton}</ThemedText>
          </Pressable>

          {feedbackMsg && (
            <View style={[styles.toastBox, { backgroundColor: '#05966922' }]}>
              <ThemedText style={{ color: '#059669', fontWeight: '700' }}>
                {feedbackMsg}
              </ThemedText>
            </View>
          )}

          {/* App Settings */}
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">{t.schedule.settingsTitle}</ThemedText>

            {/* Language Switch */}
            <View style={styles.settingRow}>
              <ThemedText>{t.schedule.languageLabel}</ThemedText>
              <View style={styles.langToggle}>
                <Pressable
                  onPress={() => void updateSettings({ language: 'bn' })}
                  style={[
                    styles.langBtn,
                    {
                      backgroundColor:
                        settings.language === 'bn' ? '#2563EB' : theme.backgroundSelected,
                    },
                  ]}>
                  <ThemedText
                    style={{
                      color: settings.language === 'bn' ? '#FFFFFF' : theme.text,
                      fontWeight: '700',
                    }}>
                    বাংলা
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => void updateSettings({ language: 'en' })}
                  style={[
                    styles.langBtn,
                    {
                      backgroundColor:
                        settings.language === 'en' ? '#2563EB' : theme.backgroundSelected,
                    },
                  ]}>
                  <ThemedText
                    style={{
                      color: settings.language === 'en' ? '#FFFFFF' : theme.text,
                      fontWeight: '700',
                    }}>
                    English
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingTextWrap}>
                <ThemedText>{t.schedule.autoContinueLabel}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t.schedule.autoContinueDesc}
                </ThemedText>
              </View>
              <Switch
                value={settings.autoContinue}
                onValueChange={(v) => void updateSettings({ autoContinue: v })}
              />
            </View>

            <View style={styles.settingRow}>
              <ThemedText>{t.schedule.soundLabel}</ThemedText>
              <Switch
                value={settings.soundEnabled}
                onValueChange={(v) => void updateSettings({ soundEnabled: v })}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingTextWrap}>
                <ThemedText>{t.schedule.voiceLabel}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t.schedule.voiceDesc}
                </ThemedText>
              </View>
              <Switch
                value={settings.voiceEnabled}
                onValueChange={(v) => void updateSettings({ voiceEnabled: v })}
              />
            </View>

            <View style={styles.settingRow}>
              <ThemedText>{t.schedule.vibrationLabel}</ThemedText>
              <Switch
                value={settings.vibrationEnabled}
                onValueChange={(v) => void updateSettings({ vibrationEnabled: v })}
              />
            </View>
          </View>

          {/* Permissions & Battery Tip */}
          {Platform.OS !== 'web' && (
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">{t.schedule.permissionsTitle}</ThemedText>
              <View style={styles.settingRow}>
                <ThemedText type="small" style={{ flex: 1 }}>
                  {exactAlarmOk ? t.schedule.exactAlarmOk : t.schedule.exactAlarmMissing}
                </ThemedText>
                {!exactAlarmOk && (
                  <Pressable
                    style={[styles.smallBtn, { backgroundColor: '#2563EB' }]}
                    onPress={async () => {
                      const granted = await requestExactAlarmPermission();
                      setExactAlarmOk(granted);
                    }}>
                    <ThemedText style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                      {t.schedule.requestPermission}
                    </ThemedText>
                  </Pressable>
                )}
              </View>

              <ThemedText type="smallBold">{t.schedule.batteryTipTitle}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t.schedule.batteryTipBody}
              </ThemedText>
            </View>
          )}
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
  card: {
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  linkAction: {
    color: '#2563EB',
    fontWeight: '700',
  },
  chipsRow: {
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    fontSize: 15,
  },
  deleteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeBox: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    gap: 4,
    alignItems: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  pickerWrap: {
    alignItems: 'center',
    gap: 6,
  },
  doneBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  smallInput: {
    minWidth: 74,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    fontSize: 14,
    textAlign: 'center',
  },
  daysRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
  },
  dayBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtn: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  toastBox: {
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  settingTextWrap: {
    flex: 1,
    gap: 2,
  },
  langToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
});
