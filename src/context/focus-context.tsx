import * as Notifications from 'expo-notifications';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  buildFocusDoneMessage,
  buildRangeDoneMessage,
  buildRestDoneMessage,
  translations,
  type TranslationStrings,
} from '@/i18n/translations';
import {
  cancelAllScheduledAlarms,
  configureForegroundNotificationHandler,
  NOTIFICATION_ACTION,
  scheduleWindowAlarms,
  setupNotificationChannelsAndCategories,
} from '@/services/notification-service';
import { playAlarmFeedback, stopAlarmSound } from '@/services/sound-service';
import { speakAnnouncement, stopSpeech } from '@/services/speech-service';
import {
  DEFAULT_PROFILES,
  DEFAULT_SETTINGS,
  initStorage,
  insertFocusSessionLog,
  loadProfiles,
  loadRuntimeState,
  loadSettings,
  saveProfiles,
  saveRuntimeState,
  saveSettings,
} from '@/services/storage-service';
import type {
  AlarmEvent,
  AppSettings,
  FocusProfile,
  RuntimeTimerState,
  TimelineSlot,
  TimerPhase,
} from '@/types/focus';
import {
  buildWindowSchedule,
  findSlotAtTime,
  getLocalDateKey,
  getWindowKey,
  resolveProfileWindow,
} from '@/utils/schedule-calculator';

interface FocusContextValue {
  ready: boolean;
  nowMs: number;
  settings: AppSettings;
  t: TranslationStrings;
  profiles: FocusProfile[];
  activeProfile: FocusProfile;
  slots: TimelineSlot[];
  windowStartAt: number | null;
  windowEndAt: number | null;
  isActiveDay: boolean;
  phase: TimerPhase;
  currentSlot: TimelineSlot | null;
  remainingMs: number;
  progress: number;
  todayFocusMinutes: number;
  completedCyclesToday: number;
  nextAlarmAt: number | null;
  activeAlarm: AlarmEvent | null;
  statsRevision: number;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  saveProfile: (profile: FocusProfile, startImmediately?: boolean) => Promise<void>;
  setActiveProfileId: (id: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  startFocus: () => Promise<void>;
  stopFocus: () => Promise<void>;
  pauseTimer: () => Promise<void>;
  resumeTimer: () => Promise<void>;
  startRestFromAck: () => Promise<void>;
  startFocusFromAck: () => Promise<void>;
  skipRest: () => Promise<void>;
  snooze5Min: () => Promise<void>;
  resetDay: () => Promise<void>;
  dismissAlarmModal: () => void;
  testAlarm: () => Promise<void>;
  bumpStatsRevision: () => void;
}

const FocusContext = createContext<FocusContextValue | null>(null);

configureForegroundNotificationHandler();

function isRuntimeHalted(r: RuntimeTimerState | null | undefined): boolean {
  return (
    !r ||
    !r.startedByUser ||
    r.phase === 'inactive' ||
    r.phase === 'completed_range' ||
    r.pausedAt !== null ||
    r.pendingAckType !== null
  );
}

function buildInactiveRuntime(
  profileId: string,
  windowKey: string,
  completedFocusMinutesToday: number = 0,
  completedCyclesToday: number = 0
): RuntimeTimerState {
  return {
    profileId,
    windowKey,
    phase: 'inactive',
    currentSlotIndex: 0,
    pausedAt: null,
    shiftOffsetMs: 0,
    pendingAckType: null,
    completedFocusMinutesToday,
    completedCyclesToday,
    startedByUser: false,
  };
}

function buildStartedRuntime(params: {
  profile: FocusProfile;
  win: { windowStartAt: number; windowEndAt: number; isActiveDay: boolean } | null;
  slots: TimelineSlot[];
  windowKey: string;
  nowMs: number;
  completedFocusMinutesToday?: number;
  completedCyclesToday?: number;
}): RuntimeTimerState {
  const {
    profile,
    win,
    slots,
    windowKey,
    nowMs,
    completedFocusMinutesToday = 0,
    completedCyclesToday = 0,
  } = params;

  if (!win || !win.isActiveDay) {
    return {
      profileId: profile.id,
      windowKey,
      phase: 'outside_range',
      currentSlotIndex: 0,
      pausedAt: null,
      shiftOffsetMs: 0,
      pendingAckType: null,
      completedFocusMinutesToday,
      completedCyclesToday,
      startedByUser: true,
    };
  }

  const slot = findSlotAtTime(slots, nowMs, 0);
  if (!slot) {
    return {
      profileId: profile.id,
      windowKey,
      phase: nowMs >= win.windowEndAt ? 'completed_range' : 'outside_range',
      currentSlotIndex: 0,
      pausedAt: null,
      shiftOffsetMs: 0,
      pendingAckType: null,
      completedFocusMinutesToday,
      completedCyclesToday,
      startedByUser: true,
    };
  }

  // If the user taps Start Focus during a scheduled rest slot, jump straight into the next focus slot
  if (slot.type === 'rest') {
    const nextFocusSlot = slots[slot.index + 1];
    if (nextFocusSlot) {
      return {
        profileId: profile.id,
        windowKey,
        phase: 'focusing',
        currentSlotIndex: nextFocusSlot.index,
        pausedAt: null,
        shiftOffsetMs: nowMs - nextFocusSlot.startAt,
        pendingAckType: null,
        completedFocusMinutesToday,
        completedCyclesToday,
        startedByUser: true,
      };
    }
    return {
      profileId: profile.id,
      windowKey,
      phase: 'resting',
      currentSlotIndex: slot.index,
      pausedAt: null,
      shiftOffsetMs: 0,
      pendingAckType: null,
      completedFocusMinutesToday,
      completedCyclesToday,
      startedByUser: true,
    };
  }

  return {
    profileId: profile.id,
    windowKey,
    phase: 'focusing',
    currentSlotIndex: slot.index,
    pausedAt: null,
    shiftOffsetMs: 0,
    pendingAckType: null,
    completedFocusMinutesToday,
    completedCyclesToday,
    startedByUser: true,
  };
}

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [profiles, setProfiles] = useState<FocusProfile[]>(DEFAULT_PROFILES);
  const [runtime, setRuntime] = useState<RuntimeTimerState | null>(null);
  const [activeAlarm, setActiveAlarm] = useState<AlarmEvent | null>(null);
  const [statsRevision, setStatsRevision] = useState(0);

  const handledSlotsRef = useRef<Set<string>>(new Set());

  const activeProfile = useMemo(
    () => profiles.find((p) => p.isActive) ?? profiles[0] ?? DEFAULT_PROFILES[0],
    [profiles]
  );

  const resolvedWindow = useMemo(
    () => resolveProfileWindow(activeProfile, nowMs),
    [activeProfile, nowMs]
  );

  const slots = useMemo(() => {
    if (!resolvedWindow) return [];
    return buildWindowSchedule(
      activeProfile,
      resolvedWindow.windowStartAt,
      resolvedWindow.windowEndAt
    ).slots;
  }, [activeProfile, resolvedWindow]);

  const windowKey = useMemo(() => {
    if (!resolvedWindow) return `${activeProfile.id}:none`;
    return getWindowKey(activeProfile.id, resolvedWindow.windowStartAt);
  }, [activeProfile.id, resolvedWindow]);

  const syncNotifications = useCallback(
    async (
      targetProfile: FocusProfile,
      targetSlots: TimelineSlot[],
      targetSettings: AppSettings,
      shiftOffsetMs: number,
      isPausedOrAwaiting: boolean
    ) => {
      if (isPausedOrAwaiting) {
        await cancelAllScheduledAlarms();
        return;
      }
      await scheduleWindowAlarms({
        profile: targetProfile,
        slots: targetSlots,
        settings: targetSettings,
        shiftOffsetMs,
      });
    },
    []
  );

  // Initial load
  useEffect(() => {
    let mounted = true;
    (async () => {
      await initStorage();
      const [loadedSettings, loadedProfiles, loadedRuntime] = await Promise.all([
        loadSettings(),
        loadProfiles(),
        loadRuntimeState(),
      ]);
      if (!mounted) return;

      setSettings(loadedSettings);
      setProfiles(loadedProfiles);
      await setupNotificationChannelsAndCategories(loadedSettings.language);

      const currentActive =
        loadedProfiles.find((p) => p.isActive) ?? loadedProfiles[0] ?? DEFAULT_PROFILES[0];
      const now = Date.now();
      const win = resolveProfileWindow(currentActive, now);
      const winSlots = win
        ? buildWindowSchedule(currentActive, win.windowStartAt, win.windowEndAt).slots
        : [];
      const wKey = win ? getWindowKey(currentActive.id, win.windowStartAt) : `${currentActive.id}:none`;

      let initialRuntime: RuntimeTimerState;
      if (
        loadedRuntime &&
        loadedRuntime.windowKey === wKey &&
        loadedRuntime.startedByUser &&
        loadedRuntime.phase !== 'inactive'
      ) {
        initialRuntime = loadedRuntime;
      } else {
        const sameWindow = loadedRuntime && loadedRuntime.windowKey === wKey;
        initialRuntime = buildInactiveRuntime(
          currentActive.id,
          wKey,
          sameWindow ? loadedRuntime.completedFocusMinutesToday : 0,
          sameWindow ? loadedRuntime.completedCyclesToday : 0
        );
        await saveRuntimeState(initialRuntime);
      }

      if (!mounted) return;
      setRuntime(initialRuntime);
      setReady(true);

      await syncNotifications(
        currentActive,
        winSlots,
        loadedSettings,
        initialRuntime.shiftOffsetMs,
        isRuntimeHalted(initialRuntime)
      );
    })();
    return () => {
      mounted = false;
    };
  }, [syncNotifications]);

  // Trigger alarm modal, audio, haptics, and speech
  const triggerAlarm = useCallback(
    async (event: AlarmEvent, currentSettings: AppSettings) => {
      setActiveAlarm(event);
      await playAlarmFeedback(event.type, {
        soundEnabled: currentSettings.soundEnabled,
        vibrationEnabled: currentSettings.vibrationEnabled,
      });

      if (currentSettings.voiceEnabled) {
        if (event.type === 'range_complete') {
          const bn = buildRangeDoneMessage(event.cumulativeFocusMinutes, 'bn');
          const en = buildRangeDoneMessage(event.cumulativeFocusMinutes, 'en');
          await speakAnnouncement(
            currentSettings.language === 'bn' ? bn.body : en.body,
            currentSettings.language,
            en.body
          );
        } else if (event.type === 'focus_complete') {
          const bn = buildFocusDoneMessage(
            event.cumulativeFocusMinutes,
            event.restMinutes,
            'bn'
          );
          const en = buildFocusDoneMessage(
            event.cumulativeFocusMinutes,
            event.restMinutes,
            'en'
          );
          await speakAnnouncement(
            currentSettings.language === 'bn' ? bn.body : en.body,
            currentSettings.language,
            en.body
          );
        } else {
          const bn = buildRestDoneMessage('bn');
          const en = buildRestDoneMessage('en');
          await speakAnnouncement(
            currentSettings.language === 'bn' ? bn.body : en.body,
            currentSettings.language,
            en.body
          );
        }
      }
    },
    []
  );

  const evalContextRef = useRef({
    runtime,
    activeProfile,
    resolvedWindow,
    slots,
    settings,
    windowKey,
  });

  useEffect(() => {
    evalContextRef.current = {
      runtime,
      activeProfile,
      resolvedWindow,
      slots,
      settings,
      windowKey,
    };
  }, [runtime, activeProfile, resolvedWindow, slots, settings, windowKey]);

  const evaluateTick = useCallback(
    (tickNowMs: number) => {
      const {
        runtime: curRuntime,
        activeProfile: curProfile,
        resolvedWindow: curWindow,
        slots: curSlots,
        settings: curSettings,
        windowKey: curWindowKey,
      } = evalContextRef.current;

      if (!curRuntime || !curWindow) return;

      // Reset runtime to inactive when day/window rolls over
      if (curRuntime.windowKey !== curWindowKey) {
        const next = buildInactiveRuntime(curProfile.id, curWindowKey);
        setRuntime(next);
        void saveRuntimeState(next);
        void syncNotifications(curProfile, curSlots, curSettings, 0, true);
        return;
      }

      if (isRuntimeHalted(curRuntime) || curSlots.length === 0) {
        return;
      }

      const shift = curRuntime.shiftOffsetMs;
      const lastSlot = curSlots[curSlots.length - 1];
      const windowEndedAt = lastSlot.endAt + shift;

      // Check if the current slot just completed
      const currentSlot = curSlots[curRuntime.currentSlotIndex];
      if (currentSlot && tickNowMs >= currentSlot.endAt + shift) {
        const slotKey = `${curWindowKey}:${currentSlot.index}`;
        if (!handledSlotsRef.current.has(slotKey)) {
          handledSlotsRef.current.add(slotKey);

          const isFinal =
            currentSlot.index === lastSlot.index || tickNowMs >= windowEndedAt;
          const completedMinutes =
            currentSlot.type === 'focus'
              ? curRuntime.completedFocusMinutesToday + currentSlot.durationMinutes
              : curRuntime.completedFocusMinutesToday;
          const completedCycles =
            currentSlot.type === 'focus'
              ? curRuntime.completedCyclesToday + 1
              : curRuntime.completedCyclesToday;

          if (currentSlot.type === 'focus') {
            void insertFocusSessionLog({
              id: slotKey,
              dateKey: getLocalDateKey(currentSlot.endAt + shift),
              profileId: curProfile.id,
              profileName: curProfile.name,
              focusMinutes: currentSlot.durationMinutes,
              completedAt: currentSlot.endAt + shift,
            }).then(() => setStatsRevision((v) => v + 1));
          }

          if (isFinal) {
            const nextState: RuntimeTimerState = {
              ...curRuntime,
              phase: 'completed_range',
              completedFocusMinutesToday: completedMinutes,
              completedCyclesToday: completedCycles,
            };
            setRuntime(nextState);
            void saveRuntimeState(nextState);
            void cancelAllScheduledAlarms();
            void triggerAlarm(
              {
                type: 'range_complete',
                slotIndex: currentSlot.index,
                cumulativeFocusMinutes: completedMinutes,
                restMinutes: curProfile.restMinutes,
                triggeredAt: tickNowMs,
              },
              curSettings
            );
            return;
          }

          if (!curSettings.autoContinue) {
            const ackType = currentSlot.type === 'focus' ? 'rest' : 'focus';
            const nextState: RuntimeTimerState = {
              ...curRuntime,
              phase: ackType === 'rest' ? 'awaiting_rest_ack' : 'awaiting_focus_ack',
              pausedAt: currentSlot.endAt + shift,
              pendingAckType: ackType,
              completedFocusMinutesToday: completedMinutes,
              completedCyclesToday: completedCycles,
            };
            setRuntime(nextState);
            void saveRuntimeState(nextState);
            void cancelAllScheduledAlarms();
            void triggerAlarm(
              {
                type: currentSlot.type === 'focus' ? 'focus_complete' : 'rest_complete',
                slotIndex: currentSlot.index,
                cumulativeFocusMinutes: completedMinutes,
                restMinutes: curProfile.restMinutes,
                triggeredAt: tickNowMs,
              },
              curSettings
            );
            return;
          }

          // Auto-continue: jump to the slot matching tickNowMs
          const activeAtNow = findSlotAtTime(curSlots, tickNowMs, shift);
          if (activeAtNow) {
            const nextState: RuntimeTimerState = {
              ...curRuntime,
              currentSlotIndex: activeAtNow.index,
              phase: activeAtNow.type === 'focus' ? 'focusing' : 'resting',
              completedFocusMinutesToday: completedMinutes,
              completedCyclesToday: completedCycles,
            };
            setRuntime(nextState);
            void saveRuntimeState(nextState);
            void triggerAlarm(
              {
                type: currentSlot.type === 'focus' ? 'focus_complete' : 'rest_complete',
                slotIndex: currentSlot.index,
                cumulativeFocusMinutes: completedMinutes,
                restMinutes: curProfile.restMinutes,
                triggeredAt: tickNowMs,
              },
              curSettings
            );
          }
        }
        return;
      }

      // Normal progression check when entering window from outside_range
      const slotAtNow = findSlotAtTime(curSlots, tickNowMs, shift);
      if (
        slotAtNow &&
        (curRuntime.phase === 'outside_range' ||
          curRuntime.currentSlotIndex !== slotAtNow.index)
      ) {
        const nextState: RuntimeTimerState = {
          ...curRuntime,
          currentSlotIndex: slotAtNow.index,
          phase: slotAtNow.type === 'focus' ? 'focusing' : 'resting',
        };
        setRuntime(nextState);
        void saveRuntimeState(nextState);
      } else if (!slotAtNow && tickNowMs >= windowEndedAt) {
        const nextState: RuntimeTimerState = {
          ...curRuntime,
          phase: 'completed_range',
        };
        setRuntime(nextState);
        void saveRuntimeState(nextState);
      }
    },
    [syncNotifications, triggerAlarm]
  );

  // Foreground 1-second clock tick & AppState sync
  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      evaluateTick(now);
    }, 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const now = Date.now();
        setNowMs(now);
        evaluateTick(now);
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [evaluateTick, ready]);

  const pauseTimer = useCallback(async () => {
    if (!runtime || runtime.pausedAt !== null) return;
    const next: RuntimeTimerState = {
      ...runtime,
      phase: 'paused',
      pausedAt: Date.now(),
    };
    setRuntime(next);
    await saveRuntimeState(next);
    await cancelAllScheduledAlarms();
  }, [runtime]);

  const resumeTimer = useCallback(async () => {
    if (!runtime || runtime.pausedAt === null) return;
    const now = Date.now();
    const delta = Math.max(0, now - runtime.pausedAt);
    const nextShift = runtime.shiftOffsetMs + delta;
    const currentSlot = slots[runtime.currentSlotIndex];
    const nextPhase: TimerPhase = currentSlot
      ? currentSlot.type === 'focus'
        ? 'focusing'
        : 'resting'
      : 'outside_range';
    const next: RuntimeTimerState = {
      ...runtime,
      phase: nextPhase,
      pausedAt: null,
      pendingAckType: null,
      shiftOffsetMs: nextShift,
    };
    setRuntime(next);
    await saveRuntimeState(next);
    await syncNotifications(activeProfile, slots, settings, nextShift, false);
  }, [activeProfile, runtime, settings, slots, syncNotifications]);

  const startRestFromAck = useCallback(async () => {
    stopAlarmSound();
    await stopSpeech();
    setActiveAlarm(null);
    if (!runtime) return;

    const now = Date.now();
    const waitDelta = runtime.pausedAt ? Math.max(0, now - runtime.pausedAt) : 0;
    const nextShift = runtime.shiftOffsetMs + waitDelta;
    const nextIndex = Math.min(runtime.currentSlotIndex + 1, Math.max(0, slots.length - 1));
    const nextSlot = slots[nextIndex];
    const next: RuntimeTimerState = {
      ...runtime,
      currentSlotIndex: nextIndex,
      phase: nextSlot ? (nextSlot.type === 'rest' ? 'resting' : 'focusing') : 'completed_range',
      pausedAt: null,
      pendingAckType: null,
      shiftOffsetMs: nextShift,
    };
    setRuntime(next);
    await saveRuntimeState(next);
    await syncNotifications(activeProfile, slots, settings, nextShift, false);
  }, [activeProfile, runtime, settings, slots, syncNotifications]);

  const startFocusFromAck = useCallback(async () => {
    stopAlarmSound();
    await stopSpeech();
    setActiveAlarm(null);
    if (!runtime) return;

    const now = Date.now();
    const waitDelta = runtime.pausedAt ? Math.max(0, now - runtime.pausedAt) : 0;
    const nextShift = runtime.shiftOffsetMs + waitDelta;
    const nextIndex = Math.min(runtime.currentSlotIndex + 1, Math.max(0, slots.length - 1));
    const nextSlot = slots[nextIndex];
    const next: RuntimeTimerState = {
      ...runtime,
      currentSlotIndex: nextIndex,
      phase: nextSlot ? (nextSlot.type === 'focus' ? 'focusing' : 'resting') : 'completed_range',
      pausedAt: null,
      pendingAckType: null,
      shiftOffsetMs: nextShift,
    };
    setRuntime(next);
    await saveRuntimeState(next);
    await syncNotifications(activeProfile, slots, settings, nextShift, false);
  }, [activeProfile, runtime, settings, slots, syncNotifications]);

  const skipRest = useCallback(async () => {
    stopAlarmSound();
    await stopSpeech();
    setActiveAlarm(null);
    if (!runtime) return;

    const now = Date.now();
    const currentSlot = slots[runtime.currentSlotIndex];
    // If awaiting rest after focus, skip next rest slot and jump straight to following focus slot
    if (runtime.pendingAckType === 'rest') {
      const restSlot = slots[runtime.currentSlotIndex + 1];
      const nextFocusSlot = slots[runtime.currentSlotIndex + 2];
      if (!nextFocusSlot) {
        const next: RuntimeTimerState = {
          ...runtime,
          phase: 'completed_range',
          pausedAt: null,
          pendingAckType: null,
        };
        setRuntime(next);
        await saveRuntimeState(next);
        await cancelAllScheduledAlarms();
        return;
      }
      const nextShift = now - nextFocusSlot.startAt;
      const next: RuntimeTimerState = {
        ...runtime,
        currentSlotIndex: nextFocusSlot.index,
        phase: 'focusing',
        pausedAt: null,
        pendingAckType: null,
        shiftOffsetMs: restSlot ? nextShift : runtime.shiftOffsetMs,
      };
      setRuntime(next);
      await saveRuntimeState(next);
      await syncNotifications(activeProfile, slots, settings, next.shiftOffsetMs, false);
      return;
    }

    // If currently in resting phase, jump straight to next focus slot
    if (currentSlot?.type === 'rest') {
      const nextFocusSlot = slots[runtime.currentSlotIndex + 1];
      if (!nextFocusSlot) {
        const next: RuntimeTimerState = {
          ...runtime,
          phase: 'completed_range',
          pausedAt: null,
          pendingAckType: null,
        };
        setRuntime(next);
        await saveRuntimeState(next);
        await cancelAllScheduledAlarms();
        return;
      }
      const nextShift = now - nextFocusSlot.startAt;
      const next: RuntimeTimerState = {
        ...runtime,
        currentSlotIndex: nextFocusSlot.index,
        phase: 'focusing',
        pausedAt: null,
        pendingAckType: null,
        shiftOffsetMs: nextShift,
      };
      setRuntime(next);
      await saveRuntimeState(next);
      await syncNotifications(activeProfile, slots, settings, nextShift, false);
    }
  }, [activeProfile, runtime, settings, slots, syncNotifications]);

  const snooze5Min = useCallback(async () => {
    stopAlarmSound();
    await stopSpeech();
    setActiveAlarm(null);
    if (!runtime) return;

    const now = Date.now();
    const currentSlot = slots[runtime.currentSlotIndex];
    if (!currentSlot) return;

    const targetEnd = now + 5 * 60_000;
    const nextShift = targetEnd - currentSlot.endAt;
    handledSlotsRef.current.delete(`${windowKey}:${currentSlot.index}`);

    const next: RuntimeTimerState = {
      ...runtime,
      phase: currentSlot.type === 'focus' ? 'focusing' : 'resting',
      pausedAt: null,
      pendingAckType: null,
      shiftOffsetMs: nextShift,
    };
    setRuntime(next);
    await saveRuntimeState(next);
    await syncNotifications(activeProfile, slots, settings, nextShift, false);
  }, [activeProfile, runtime, settings, slots, syncNotifications, windowKey]);

  const startFocus = useCallback(async () => {
    stopAlarmSound();
    await stopSpeech();
    setActiveAlarm(null);
    handledSlotsRef.current.clear();

    const next = buildStartedRuntime({
      profile: activeProfile,
      win: resolvedWindow,
      slots,
      windowKey,
      nowMs: Date.now(),
      completedFocusMinutesToday:
        runtime?.windowKey === windowKey ? runtime.completedFocusMinutesToday : 0,
      completedCyclesToday:
        runtime?.windowKey === windowKey ? runtime.completedCyclesToday : 0,
    });
    setRuntime(next);
    await saveRuntimeState(next);
    await syncNotifications(
      activeProfile,
      slots,
      settings,
      next.shiftOffsetMs,
      isRuntimeHalted(next)
    );
  }, [activeProfile, resolvedWindow, runtime, settings, slots, syncNotifications, windowKey]);

  const stopFocus = useCallback(async () => {
    stopAlarmSound();
    await stopSpeech();
    setActiveAlarm(null);
    handledSlotsRef.current.clear();

    const next = buildInactiveRuntime(
      activeProfile.id,
      windowKey,
      runtime?.windowKey === windowKey ? runtime.completedFocusMinutesToday : 0,
      runtime?.windowKey === windowKey ? runtime.completedCyclesToday : 0
    );
    setRuntime(next);
    await saveRuntimeState(next);
    await cancelAllScheduledAlarms();
  }, [activeProfile.id, runtime, windowKey]);

  const resetDay = useCallback(async () => {
    stopAlarmSound();
    await stopSpeech();
    setActiveAlarm(null);
    handledSlotsRef.current.clear();

    const next = buildInactiveRuntime(activeProfile.id, windowKey, 0, 0);
    setRuntime(next);
    await saveRuntimeState(next);
    await cancelAllScheduledAlarms();
  }, [activeProfile.id, windowKey]);

  // Listen for notification action buttons
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const actionId = response.actionIdentifier;
      if (actionId === NOTIFICATION_ACTION.START_REST) {
        void startRestFromAck();
      } else if (actionId === NOTIFICATION_ACTION.START_FOCUS) {
        void startFocusFromAck();
      } else if (actionId === NOTIFICATION_ACTION.SKIP_REST) {
        void skipRest();
      } else if (actionId === NOTIFICATION_ACTION.SNOOZE_5) {
        void snooze5Min();
      }
    });
    return () => sub.remove();
  }, [skipRest, snooze5Min, startFocusFromAck, startRestFromAck]);

  const applyNewProfilesAndResync = useCallback(
    async (
      nextProfiles: FocusProfile[],
      nextSettings: AppSettings,
      startImmediately: boolean = false
    ) => {
      const target =
        nextProfiles.find((p) => p.isActive) ?? nextProfiles[0] ?? DEFAULT_PROFILES[0];
      const now = Date.now();
      const win = resolveProfileWindow(target, now);
      const winSlots = win
        ? buildWindowSchedule(target, win.windowStartAt, win.windowEndAt).slots
        : [];
      const wKey = win ? getWindowKey(target.id, win.windowStartAt) : `${target.id}:none`;
      const sameWindow = runtime?.windowKey === wKey;
      const prevMinutes = sameWindow ? runtime.completedFocusMinutesToday : 0;
      const prevCycles = sameWindow ? runtime.completedCyclesToday : 0;

      stopAlarmSound();
      await stopSpeech();
      setActiveAlarm(null);
      handledSlotsRef.current.clear();

      const nextRuntime = startImmediately
        ? buildStartedRuntime({
            profile: target,
            win,
            slots: winSlots,
            windowKey: wKey,
            nowMs: now,
            completedFocusMinutesToday: prevMinutes,
            completedCyclesToday: prevCycles,
          })
        : buildInactiveRuntime(target.id, wKey, prevMinutes, prevCycles);

      setRuntime(nextRuntime);
      await saveRuntimeState(nextRuntime);
      await syncNotifications(
        target,
        winSlots,
        nextSettings,
        nextRuntime.shiftOffsetMs,
        isRuntimeHalted(nextRuntime)
      );
    },
    [runtime, syncNotifications]
  );

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await saveSettings(next);
      await setupNotificationChannelsAndCategories(next.language);
      await syncNotifications(
        activeProfile,
        slots,
        next,
        runtime?.shiftOffsetMs ?? 0,
        isRuntimeHalted(runtime)
      );
    },
    [activeProfile, runtime, settings, slots, syncNotifications]
  );

  const saveProfile = useCallback(
    async (profile: FocusProfile, startImmediately: boolean = false) => {
      const exists = profiles.some((p) => p.id === profile.id);
      let next = exists
        ? profiles.map((p) => (p.id === profile.id ? profile : p))
        : [...profiles, profile];
      if (profile.isActive) {
        next = next.map((p) => ({ ...p, isActive: p.id === profile.id }));
      }
      setProfiles(next);
      await saveProfiles(next);
      await applyNewProfilesAndResync(next, settings, startImmediately);
    },
    [applyNewProfilesAndResync, profiles, settings]
  );

  const setActiveProfileId = useCallback(
    async (id: string) => {
      const next = profiles.map((p) => ({ ...p, isActive: p.id === id }));
      setProfiles(next);
      await saveProfiles(next);
      await applyNewProfilesAndResync(next, settings);
    },
    [applyNewProfilesAndResync, profiles, settings]
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      if (profiles.length <= 1) return;
      const filtered = profiles.filter((p) => p.id !== id);
      const hasActive = filtered.some((p) => p.isActive);
      const next = hasActive
        ? filtered
        : filtered.map((p, idx) => ({ ...p, isActive: idx === 0 }));
      setProfiles(next);
      await saveProfiles(next);
      await applyNewProfilesAndResync(next, settings);
    },
    [applyNewProfilesAndResync, profiles, settings]
  );

  const dismissAlarmModal = useCallback(() => {
    stopAlarmSound();
    void stopSpeech();
    setActiveAlarm(null);
  }, []);

  const testAlarm = useCallback(async () => {
    const sampleCumulative =
      (runtime?.completedFocusMinutesToday ?? 0) + activeProfile.focusMinutes;
    await triggerAlarm(
      {
        type: 'focus_complete',
        slotIndex: runtime?.currentSlotIndex ?? 0,
        cumulativeFocusMinutes: sampleCumulative,
        restMinutes: activeProfile.restMinutes,
        triggeredAt: Date.now(),
      },
      settings
    );
  }, [activeProfile.focusMinutes, activeProfile.restMinutes, runtime, settings, triggerAlarm]);

  const bumpStatsRevision = useCallback(() => {
    setStatsRevision((v) => v + 1);
  }, []);

  const shift = runtime?.shiftOffsetMs ?? 0;
  const currentSlot = runtime ? (slots[runtime.currentSlotIndex] ?? null) : null;
  const phase: TimerPhase = runtime?.phase ?? 'inactive';

  let remainingMs = 0;
  let progress = 0;
  let nextAlarmAt: number | null = null;

  if (currentSlot && (phase === 'focusing' || phase === 'resting' || phase === 'paused')) {
    const refNow = runtime?.pausedAt ?? nowMs;
    const startAt = currentSlot.startAt + shift;
    const endAt = currentSlot.endAt + shift;
    const total = Math.max(1, endAt - startAt);
    remainingMs = Math.max(0, endAt - refNow);
    progress = Math.min(1, Math.max(0, (refNow - startAt) / total));
    if (phase !== 'paused') {
      nextAlarmAt = endAt;
    }
  } else if (phase === 'outside_range' && resolvedWindow) {
    remainingMs = Math.max(0, resolvedWindow.windowStartAt - nowMs);
  } else if (phase === 'inactive') {
    remainingMs = Math.max(1, activeProfile.focusMinutes) * 60_000;
  }

  const value: FocusContextValue = {
    ready,
    nowMs,
    settings,
    t: translations[settings.language],
    profiles,
    activeProfile,
    slots,
    windowStartAt: resolvedWindow?.windowStartAt ?? null,
    windowEndAt: resolvedWindow?.windowEndAt ?? null,
    isActiveDay: resolvedWindow?.isActiveDay ?? false,
    phase,
    currentSlot,
    remainingMs,
    progress,
    todayFocusMinutes: runtime?.completedFocusMinutesToday ?? 0,
    completedCyclesToday: runtime?.completedCyclesToday ?? 0,
    nextAlarmAt,
    activeAlarm,
    statsRevision,
    updateSettings,
    saveProfile,
    setActiveProfileId,
    deleteProfile,
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
    bumpStatsRevision,
  };

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus(): FocusContextValue {
  const ctx = useContext(FocusContext);
  if (!ctx) {
    throw new Error('useFocus must be used inside FocusProvider');
  }
  return ctx;
}
