import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import {
  buildFocusDoneMessage,
  buildRangeDoneMessage,
  buildRestDoneMessage,
  type TranslationStrings,
} from '@/i18n/translations';
import type { AlarmEvent, AppLanguage } from '@/types/focus';

interface AlarmModalProps {
  alarm: AlarmEvent | null;
  language: AppLanguage;
  autoContinue: boolean;
  t: TranslationStrings;
  onStartRest: () => void;
  onStartFocus: () => void;
  onSkipRest: () => void;
  onSnooze5: () => void;
  onDismiss: () => void;
}

export function AlarmModal({
  alarm,
  language,
  autoContinue,
  t,
  onStartRest,
  onStartFocus,
  onSkipRest,
  onSnooze5,
  onDismiss,
}: AlarmModalProps) {
  const theme = useTheme();
  if (!alarm) return null;

  let heading = t.today.alarmModal.focusDoneTitle;
  let body = '';
  let accent = '#2563EB';

  if (alarm.type === 'range_complete') {
    heading = t.today.alarmModal.rangeDoneTitle;
    body = buildRangeDoneMessage(alarm.cumulativeFocusMinutes, language).body;
    accent = '#0D9488';
  } else if (alarm.type === 'rest_complete') {
    heading = t.today.alarmModal.restDoneTitle;
    body = buildRestDoneMessage(language).body;
    accent = '#059669';
  } else {
    heading = t.today.alarmModal.focusDoneTitle;
    body = buildFocusDoneMessage(
      alarm.cumulativeFocusMinutes,
      alarm.restMinutes,
      language
    ).body;
    accent = '#2563EB';
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.background }]}>
          <View style={[styles.pill, { backgroundColor: `${accent}22` }]}>
            <ThemedText style={[styles.pillText, { color: accent }]}>
              {t.appName}
            </ThemedText>
          </View>

          <ThemedText type="subtitle" style={styles.heading}>
            {heading}
          </ThemedText>

          <ThemedText style={styles.body} themeColor="textSecondary">
            {body}
          </ThemedText>

          <View style={styles.actions}>
            {!autoContinue && alarm.type === 'focus_complete' && (
              <>
                {alarm.restMinutes > 0 && (
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: '#059669' }]}
                    onPress={onStartRest}>
                    <ThemedText style={styles.primaryBtnText}>
                      {t.today.actions.startRest}
                    </ThemedText>
                  </Pressable>
                )}
                <View style={styles.row}>
                  <Pressable
                    style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                    onPress={onSnooze5}>
                    <ThemedText style={styles.secondaryBtnText}>
                      {t.today.actions.snooze5}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryBtn, { backgroundColor: theme.backgroundElement }]}
                    onPress={onSkipRest}>
                    <ThemedText style={styles.secondaryBtnText}>
                      {t.today.actions.skipRest}
                    </ThemedText>
                  </Pressable>
                </View>
              </>
            )}

            {!autoContinue && alarm.type === 'rest_complete' && (
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: '#2563EB' }]}
                onPress={onStartFocus}>
                <ThemedText style={styles.primaryBtnText}>
                  {t.today.actions.startFocus}
                </ThemedText>
              </Pressable>
            )}

            {(autoContinue || alarm.type === 'range_complete') && (
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: accent }]}
                onPress={onDismiss}>
                <ThemedText style={styles.primaryBtnText}>
                  {t.today.alarmModal.dismiss}
                </ThemedText>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    padding: 24,
    gap: 14,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heading: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
  },
  actions: {
    width: '100%',
    gap: 10,
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
