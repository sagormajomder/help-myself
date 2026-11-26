import * as Notifications from 'expo-notifications';
import {
  AndroidImportance,
  AndroidNotificationVisibility,
} from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import {
  buildFocusDoneMessage,
  buildIndividualDoneMessage,
  buildRangeDoneMessage,
  buildRestDoneMessage,
  translations,
} from '@/i18n/translations';
import type { AppLanguage, AppSettings, FocusProfile, TimelineSlot } from '@/types/focus';

export const NOTIFICATION_CATEGORY = {
  FOCUS_COMPLETE: 'focus_complete_actions',
  REST_COMPLETE: 'rest_complete_actions',
} as const;

export const NOTIFICATION_ACTION = {
  START_REST: 'START_REST',
  SKIP_REST: 'SKIP_REST',
  SNOOZE_5: 'SNOOZE_5',
  START_FOCUS: 'START_FOCUS',
} as const;

const CHANNELS = {
  CHIME_FOCUS: 'focus_chime_v1',
  CHIME_REST: 'rest_chime_v1',
  VOICE_FOCUS_BN: 'focus_voice_bn_v1',
  VOICE_REST_BN: 'rest_voice_bn_v1',
  VOICE_FOCUS_EN: 'focus_voice_en_v1',
  VOICE_REST_EN: 'rest_voice_en_v1',
  SILENT: 'focus_silent_v1',
} as const;

const MAX_SCHEDULED_NOTIFICATIONS = 56; // Safe buffer below iOS 64-notification cap

export function configureForegroundNotificationHandler(): void {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false, // Foreground playback handled by sound-service + speech-service
      shouldSetBadge: false,
    }),
  });
}

export async function setupNotificationChannelsAndCategories(
  lang: AppLanguage
): Promise<void> {
  if (Platform.OS === 'web') return;
  const t = translations[lang].notifications;

  if (Platform.OS === 'android') {
    const baseConfig = {
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 200, 250],
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
    };

    await Promise.all([
      Notifications.setNotificationChannelAsync(CHANNELS.CHIME_FOCUS, {
        ...baseConfig,
        name: t.channelChimeFocus,
        sound: 'focus_chime.wav',
      }),
      Notifications.setNotificationChannelAsync(CHANNELS.CHIME_REST, {
        ...baseConfig,
        name: t.channelChimeRest,
        sound: 'rest_chime.wav',
      }),
      Notifications.setNotificationChannelAsync(CHANNELS.VOICE_FOCUS_BN, {
        ...baseConfig,
        name: `${t.channelVoiceFocus} (BN)`,
        sound: 'focus_voice_bn.wav',
      }),
      Notifications.setNotificationChannelAsync(CHANNELS.VOICE_REST_BN, {
        ...baseConfig,
        name: `${t.channelVoiceRest} (BN)`,
        sound: 'rest_voice_bn.wav',
      }),
      Notifications.setNotificationChannelAsync(CHANNELS.VOICE_FOCUS_EN, {
        ...baseConfig,
        name: `${t.channelVoiceFocus} (EN)`,
        sound: 'focus_voice_en.wav',
      }),
      Notifications.setNotificationChannelAsync(CHANNELS.VOICE_REST_EN, {
        ...baseConfig,
        name: `${t.channelVoiceRest} (EN)`,
        sound: 'rest_voice_en.wav',
      }),
      Notifications.setNotificationChannelAsync(CHANNELS.SILENT, {
        name: 'Silent Focus Alerts',
        importance: AndroidImportance.HIGH,
        sound: null,
        enableVibrate: false,
      }),
    ]);
  }

  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORY.FOCUS_COMPLETE, [
    {
      identifier: NOTIFICATION_ACTION.START_REST,
      buttonTitle: t.actionStartRest,
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTION.SNOOZE_5,
      buttonTitle: t.actionSnooze,
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTION.SKIP_REST,
      buttonTitle: t.actionSkipRest,
      options: { opensAppToForeground: false },
    },
  ]);

  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORY.REST_COMPLETE, [
    {
      identifier: NOTIFICATION_ACTION.START_FOCUS,
      buttonTitle: t.actionStartFocus,
      options: { opensAppToForeground: false },
    },
  ]);
}

export interface PermissionStatusSummary {
  notificationsGranted: boolean;
  exactAlarmGranted: boolean;
}

export interface ExactAlarmRequestResult {
  granted: boolean;
  reason?: 'not_declared' | 'settings_opened' | 'error';
}

export async function getNotificationPermissionStatus(): Promise<PermissionStatusSummary> {
  if (Platform.OS === 'web') {
    return { notificationsGranted: false, exactAlarmGranted: false };
  }

  const current = await Notifications.getPermissionsAsync();
  let exactAlarmGranted = true;
  if (Platform.OS === 'android') {
    try {
      const exactStatus = await Notifications.getExactAlarmPermissionsAsync();
      exactAlarmGranted = exactStatus.granted;
    } catch {
      exactAlarmGranted = true;
    }
  }

  return {
    notificationsGranted: current.granted,
    exactAlarmGranted,
  };
}

export async function ensureNotificationPermissions(): Promise<PermissionStatusSummary> {
  if (Platform.OS === 'web') {
    return { notificationsGranted: false, exactAlarmGranted: false };
  }

  const initial = await getNotificationPermissionStatus();
  if (initial.notificationsGranted) {
    return initial;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return {
    notificationsGranted: requested.granted,
    exactAlarmGranted: initial.exactAlarmGranted,
  };
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  if (requested.granted) return true;

  // If the OS won't show the prompt again, take the user to App Settings so they can enable notifications
  if (!requested.canAskAgain) {
    await Linking.openSettings();
  }
  return false;
}

export async function requestExactAlarmPermission(): Promise<ExactAlarmRequestResult> {
  if (Platform.OS !== 'android') return { granted: true };

  try {
    const current = await Notifications.getExactAlarmPermissionsAsync();
    if (current.granted) {
      return { granted: true };
    }

    const res = await Notifications.requestExactAlarmPermissionsAsync();
    return { granted: res.granted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('SCHEDULE_EXACT_ALARM') || message.includes('not declare')) {
      return { granted: false, reason: 'not_declared' };
    }

    // Fallback to App Info settings if the OEM rejects the direct exact-alarm intent
    try {
      await Linking.openSettings();
      return { granted: false, reason: 'settings_opened' };
    } catch {
      return { granted: false, reason: 'error' };
    }
  }
}

function getSoundAndChannel(
  kind: 'focus' | 'rest',
  settings: AppSettings
): { channelId: string; sound: string | boolean } {
  if (!settings.soundEnabled && !settings.voiceEnabled) {
    return { channelId: CHANNELS.SILENT, sound: false };
  }
  if (settings.voiceEnabled) {
    if (settings.language === 'bn') {
      return kind === 'focus'
        ? { channelId: CHANNELS.VOICE_FOCUS_BN, sound: 'focus_voice_bn.wav' }
        : { channelId: CHANNELS.VOICE_REST_BN, sound: 'rest_voice_bn.wav' };
    }
    return kind === 'focus'
      ? { channelId: CHANNELS.VOICE_FOCUS_EN, sound: 'focus_voice_en.wav' }
      : { channelId: CHANNELS.VOICE_REST_EN, sound: 'rest_voice_en.wav' };
  }
  return kind === 'focus'
    ? { channelId: CHANNELS.CHIME_FOCUS, sound: 'focus_chime.wav' }
    : { channelId: CHANNELS.CHIME_REST, sound: 'rest_chime.wav' };
}

export async function cancelAllScheduledAlarms(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleWindowAlarms(params: {
  profile: FocusProfile;
  slots: TimelineSlot[];
  settings: AppSettings;
  shiftOffsetMs?: number;
  nowMs?: number;
}): Promise<number> {
  if (Platform.OS === 'web') return 0;

  const { profile, slots, settings, shiftOffsetMs = 0, nowMs = Date.now() } = params;
  await setupNotificationChannelsAndCategories(settings.language);
  await cancelAllScheduledAlarms();

  if (!profile.isActive || slots.length === 0) return 0;

  const { notificationsGranted } = await ensureNotificationPermissions();
  if (!notificationsGranted) return 0;

  const futureSlots = slots.filter((slot) => slot.endAt + shiftOffsetMs > nowMs + 1500);
  const toSchedule = futureSlots.slice(0, MAX_SCHEDULED_NOTIFICATIONS);
  const lastSlot = slots[slots.length - 1];

  let scheduledCount = 0;

  for (const slot of toSchedule) {
    const triggerAt = slot.endAt + shiftOffsetMs;
    const isFinalSlot = slot.index === lastSlot.index;

    let msg: { title: string; body: string };
    if (isFinalSlot) {
      msg = buildRangeDoneMessage(slot.cumulativeFocusMinutes, settings.language);
    } else if (slot.type === 'focus') {
      msg = buildFocusDoneMessage(
        slot.cumulativeFocusMinutes,
        profile.restMinutes,
        settings.language
      );
    } else {
      msg = buildRestDoneMessage(settings.language);
    }

    const { channelId, sound } = getSoundAndChannel(
      slot.type === 'focus' ? 'focus' : 'rest',
      settings
    );

    const categoryIdentifier =
      isFinalSlot
        ? undefined
        : slot.type === 'focus'
          ? NOTIFICATION_CATEGORY.FOCUS_COMPLETE
          : NOTIFICATION_CATEGORY.REST_COMPLETE;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: msg.title,
        body: msg.body,
        sound: Platform.OS === 'ios' ? sound : undefined,
        categoryIdentifier,
        data: {
          slotIndex: slot.index,
          slotType: slot.type,
          isFinalSlot,
          cumulativeFocusMinutes: slot.cumulativeFocusMinutes,
          profileId: profile.id,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(triggerAt),
        channelId,
        delivery: 'alarmClock',
      },
    });
    scheduledCount += 1;

    // In Manual Mode, only schedule the next immediate transition because later times depend on user ack
    if (!settings.autoContinue) {
      break;
    }
  }

  return scheduledCount;
}

export async function scheduleIndividualTimerAlarm(params: {
  durationMinutes: number;
  triggerAt: number;
  settings: AppSettings;
  nowMs?: number;
}): Promise<number> {
  if (Platform.OS === 'web') return 0;

  const { durationMinutes, triggerAt, settings, nowMs = Date.now() } = params;
  await setupNotificationChannelsAndCategories(settings.language);
  await cancelAllScheduledAlarms();

  if (triggerAt <= nowMs + 1000) return 0;

  const { notificationsGranted } = await ensureNotificationPermissions();
  if (!notificationsGranted) return 0;

  const msg = buildIndividualDoneMessage(durationMinutes, settings.language);
  const { channelId, sound } = getSoundAndChannel('focus', settings);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: msg.title,
      body: msg.body,
      sound: Platform.OS === 'ios' ? sound : undefined,
      categoryIdentifier: undefined,
      data: {
        slotIndex: 0,
        slotType: 'focus',
        isFinalSlot: true,
        isIndividualTimer: true,
        cumulativeFocusMinutes: durationMinutes,
        profileId: 'individual-timer',
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(triggerAt),
      channelId,
      delivery: 'alarmClock',
    },
  });

  return 1;
}
