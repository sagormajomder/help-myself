import React from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useFocus } from '@/context/focus-context';
import { useTheme } from '@/hooks/use-theme';
import {
  requestExactAlarmPermission,
  requestNotificationPermission,
} from '@/services/notification-service';

export function PermissionsCard() {
  const theme = useTheme();
  const {
    t,
    notificationsGranted,
    exactAlarmGranted,
    hasMissingPermissions,
    setNotificationsGrantedState,
    setExactAlarmGrantedState,
  } = useFocus();

  if (!hasMissingPermissions) {
    return null;
  }

  const handleRequestNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotificationsGrantedState(granted);
  };

  const handleRequestExactAlarm = async () => {
    const result = await requestExactAlarmPermission();
    setExactAlarmGrantedState(result.granted);
    if (!result.granted && (result.reason === 'not_declared' || result.reason === 'error')) {
      const message =
        result.reason === 'not_declared'
          ? t.schedule.exactAlarmRebuildBody
          : t.schedule.exactAlarmMissing;
      Alert.alert(t.schedule.permissionsTitle, message, [
        {
          text: t.schedule.openSettings,
          onPress: () => void Linking.openSettings(),
        },
        { text: t.today.alarmModal.dismiss },
      ]);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">{t.schedule.permissionsTitle}</ThemedText>

      <View style={styles.row}>
        <ThemedText type="small" style={styles.rowText}>
          {notificationsGranted ? t.schedule.notificationsOk : t.schedule.notificationsMissing}
        </ThemedText>
        {!notificationsGranted && (
          <Pressable
            style={[styles.btn, { backgroundColor: '#2563EB' }]}
            onPress={() => void handleRequestNotifications()}>
            <ThemedText style={styles.btnText}>{t.schedule.requestPermission}</ThemedText>
          </Pressable>
        )}
      </View>

      {Platform.OS === 'android' && (
        <View style={styles.row}>
          <ThemedText type="small" style={styles.rowText}>
            {exactAlarmGranted ? t.schedule.exactAlarmOk : t.schedule.exactAlarmMissing}
          </ThemedText>
          {!exactAlarmGranted && (
            <Pressable
              style={[styles.btn, { backgroundColor: '#2563EB' }]}
              onPress={() => void handleRequestExactAlarm()}>
              <ThemedText style={styles.btnText}>{t.schedule.requestPermission}</ThemedText>
            </Pressable>
          )}
        </View>
      )}

      <ThemedText type="smallBold">{t.schedule.batteryTipTitle}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t.schedule.batteryTipBody}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
});
