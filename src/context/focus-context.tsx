import * as Notifications from 'expo-notifications';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import {
  buildFocusDoneMessage,
  buildIndividualDoneMessage,
  buildRangeDoneMessage,
  buildRestDoneMessage,
  translations,
  type TranslationStrings,
} from '@/i18n/translations';
import {
  cancelAllScheduledAlarms,
  configureForegroundNotificationHandler,
  ensureNotificationPermissions,
  getNotificationPermissionStatus,
  NOTIFICATION_ACTION,
  scheduleIndividualTimerAlarm,
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
  loadIndividualTimerState,
  loadProfiles,
  loadRuntimeState,
  loadSettings,
  loadTimerMode,
  saveIndividualTimerState,
  saveProfiles,
  saveRuntimeState,
  saveSettings,
  saveTimerMode,
} from '@/services/storage-service';
import type {
  AlarmEvent,
  AppSettings,
  FocusProfile,
  IndividualTimerState,
  RuntimeTimerState,
  TimelineSlot,
  TimerMode,
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
  timerMode: TimerMode;
  individualTimer: IndividualTimerState;
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
  settingsModalVisible: boolean;
  notificationsGranted: boolean;
  exactAlarmGranted: boolean;
  hasMissingPermissions: boolean;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  setNotificationsGrantedState: (granted: boolean) => void;
  setExactAlarmGrantedState: (granted: boolean) => void;
  refreshPermissions: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setTimerMode: (mode: TimerMode) => Promise<void>;
  setIndividualDuration: (minutes: number) => Promise<void>;
  startIndividualTimer: (overrideMinutes?: number) => Promise<void>;
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

function buildDefaultIndividualTimer(
  nowMs: number,
  durationMinutes: number = 25
): IndividualTimerState {
  return {
    durationMinutes: Math.max(1, Math.round(durationMinutes)),
    status: 'idle',
    startedAt: null,
    endAt: null,
    pausedAt: null,
    dateKey: getLocalDateKey(nowMs),
    completedFocusMinutesToday: 0,
    completedCyclesToday: 0,
  };
}

function normalizeIndividualForDate(
  state: IndividualTimerState | null | undefined,
  nowMs: number
): IndividualTimerState {
  if (!state) {
    return buildDefaultIndividualTimer(nowMs);
  }
  const safeDuration =
    Number.isFinite(state.durationMinutes) && state.durationMinutes >= 1
      ? Math.round(state.durationMinutes)
      : 25;
  const todayKey = getLocalDateKey(nowMs);

  if (state.status === 'running' || state.status === 'paused') {
    return {
      ...state,
      durationMinutes: safeDuration,
    };
  }

  if (state.dateKey !== todayKey) {
    return buildDefaultIndividualTimer(nowMs, safeDuration);
  }

  return {
    ...state,
    durationMinutes: safeDuration,
  };
}

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [profiles, setProfiles] = useState<FocusProfile[]>(DEFAULT_PROFILES);
  const [runtime, setRuntime] = useState<RuntimeTimerState | null>(null);
  const [timerMode, setTimerModeState] = useState<TimerMode>('profile');
  const [individualTimer, setIndividualTimer] = useState<IndividualTimerState>(() =>
    buildDefaultIndividualTimer(Date.now())
  );
  const [activeAlarm, setActiveAlarm] = useState<AlarmEvent | null>(null);
  const [statsRevision, setStatsRevision] = useState(0);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(true);
  const [exactAlarmGranted, setExactAlarmGranted] = useState(true);

  const handledSlotsRef = useRef<Set<string>>(new Set());
  const handledIndividualRef = useRef<Set<string>>(new Set());

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
      const [
        loadedSettings,
        loadedProfiles,
        loadedRuntime,
        loadedMode,
        loadedIndividual,
      ] = await Promise.all([
        loadSettings(),
        loadProfiles(),
        loadRuntimeState(),
        loadTimerMode(),
        loadIndividualTimerState(),
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

      let initialIndividual = normalizeIndividualForDate(loadedIndividual, now);
      if (
        initialIndividual.status === 'running' &&
        initialIndividual.startedAt !== null &&
        initialIndividual.endAt !== null &&
        now >= initialIndividual.endAt
      ) {
        const sessionId = `individual:${initialIndividual.startedAt}:${initialIndividual.endAt}`;
        handledIndividualRef.current.add(sessionId);
        const todayKey = getLocalDateKey(now);
        const baseMin =
          initialIndividual.dateKey === todayKey
            ? initialIndividual.completedFocusMinutesToday
            : 0;
        const baseCycles =
          initialIndividual.dateKey === todayKey
            ? initialIndividual.completedCyclesToday
            : 0;
        await insertFocusSessionLog({
          id: sessionId,
          dateKey: getLocalDateKey(initialIndividual.endAt),
          profileId: 'individual-timer',
          profileName: translations[loadedSettings.language].today.individualTimer.sessionName,
          focusMinutes: initialIndividual.durationMinutes,
          completedAt: initialIndividual.endAt,
        });
        initialIndividual = {
          ...initialIndividual,
          status: 'completed',
          pausedAt: null,
          dateKey: todayKey,
          completedFocusMinutesToday: baseMin + initialIndividual.durationMinutes,
          completedCyclesToday: baseCycles + 1,
        };
        setStatsRevision((v) => v + 1);
      }
      await saveIndividualTimerState(initialIndividual);

      if (!mounted) return;
      setTimerModeState(loadedMode);
      setIndividualTimer(initialIndividual);
      setRuntime(initialRuntime);
      setReady(true);

      const permStatus = await ensureNotificationPermissions();
      if (mounted) {
        setNotificationsGranted(permStatus.notificationsGranted);
        setExactAlarmGranted(permStatus.exactAlarmGranted);
      }

      if (loadedMode === 'individual') {
        if (initialIndividual.status === 'running' && initialIndividual.endAt !== null) {
          await scheduleIndividualTimerAlarm({
            durationMinutes: initialIndividual.durationMinutes,
            triggerAt: initialIndividual.endAt,
            settings: loadedSettings,
            nowMs: now,
          });
        } else {
          await cancelAllScheduledAlarms();
        }
      } else {
        await syncNotifications(
          currentActive,
          winSlots,
          loadedSettings,
          initialRuntime.shiftOffsetMs,
          isRuntimeHalted(initialRuntime)
        );
      }
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
        } else if (event.type === 'individual_complete') {
          const bn = buildIndividualDoneMessage(event.cumulativeFocusMinutes, 'bn');
          const en = buildIndividualDoneMessage(event.cumulativeFocusMinutes, 'en');
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
    timerMode,
    individualTimer,
    runtime,
    activeProfile,
    resolvedWindow,
    slots,
    settings,
    windowKey,
  });

  useEffect(() => {
    evalContextRef.current = {
      timerMode,
      individualTimer,
      runtime,
      activeProfile,
      resolvedWindow,
      slots,
      settings,
      windowKey,
    };
  }, [
    timerMode,
    individualTimer,
    runtime,
    activeProfile,
    resolvedWindow,
    slots,
    settings,
    windowKey,
  ]);

  const evaluateTick = useCallback(
    (tickNowMs: number) => {
      const {
        timerMode: curMode,
        individualTimer: curIndividual,
        runtime: curRuntime,
        activeProfile: curProfile,
        resolvedWindow: curWindow,
        slots: curSlots,
        settings: curSettings,
        windowKey: curWindowKey,
      } = evalContextRef.current;

      if (curMode === 'individual') {
        const todayKey = getLocalDateKey(tickNowMs);
        if (
          curIndividual.status === 'running' &&
          curIndividual.startedAt !== null &&
          curIndividual.endAt !== null
        ) {
          if (tickNowMs >= curIndividual.endAt) {
            const sessionId = `individual:${curIndividual.startedAt}:${curIndividual.endAt}`;
            if (!handledIndividualRef.current.has(sessionId)) {
              handledIndividualRef.current.add(sessionId);

              const baseMin =
                curIndividual.dateKey === todayKey
                  ? curIndividual.completedFocusMinutesToday
                  : 0;
              const baseCycles =
                curIndividual.dateKey === todayKey
                  ? curIndividual.completedCyclesToday
                  : 0;

              void insertFocusSessionLog({
                id: sessionId,
                dateKey: getLocalDateKey(curIndividual.endAt),
                profileId: 'individual-timer',
                profileName: translations[curSettings.language].today.individualTimer.sessionName,
                focusMinutes: curIndividual.durationMinutes,
                completedAt: curIndividual.endAt,
              }).then(() => setStatsRevision((v) => v + 1));

              const nextIndividual: IndividualTimerState = {
                ...curIndividual,
                status: 'completed',
                pausedAt: null,
                dateKey: todayKey,
                completedFocusMinutesToday: baseMin + curIndividual.durationMinutes,
                completedCyclesToday: baseCycles + 1,
              };
              setIndividualTimer(nextIndividual);
              void saveIndividualTimerState(nextIndividual);
              void cancelAllScheduledAlarms();
              void triggerAlarm(
                {
                  type: 'individual_complete',
                  slotIndex: 0,
                  cumulativeFocusMinutes: curIndividual.durationMinutes,
                  restMinutes: 0,
                  triggeredAt: tickNowMs,
                },
                curSettings
              );
            }
          }
          return;
        }

        if (
          (curIndividual.status === 'idle' || curIndividual.status === 'completed') &&
          curIndividual.dateKey !== todayKey
        ) {
          const rolled = buildDefaultIndividualTimer(tickNowMs, curIndividual.durationMinutes);
          setIndividualTimer(rolled);
          void saveIndividualTimerState(rolled);
        }
        return;
      }

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

  const refreshPermissions = useCallback(async () => {
    const status = await getNotificationPermissionStatus();
    setNotificationsGranted(status.notificationsGranted);
    setExactAlarmGranted(status.exactAlarmGranted);
  }, []);

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
        void refreshPermissions();
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [evaluateTick, ready, refreshPermissions]);

  const pauseTimer = useCallback(async () => {
    if (timerMode === 'individual') {
      if (individualTimer.status !== 'running') return;
      const next: IndividualTimerState = {
        ...individualTimer,
        status: 'paused',
        pausedAt: Date.now(),
      };
      setIndividualTimer(next);
      await saveIndividualTimerState(next);
      await cancelAllScheduledAlarms();
      return;
    }

    if (!runtime || runtime.pausedAt !== null) return;
    const next: RuntimeTimerState = {
      ...runtime,
      phase: 'paused',
      pausedAt: Date.now(),
    };
    setRuntime(next);
    await saveRuntimeState(next);
    await cancelAllScheduledAlarms();
  }, [individualTimer, runtime, timerMode]);

  const resumeTimer = useCallback(async () => {
    if (timerMode === 'individual') {
      if (
        individualTimer.status !== 'paused' ||
        individualTimer.pausedAt === null ||
        individualTimer.startedAt === null ||
        individualTimer.endAt === null
      ) {
        return;
      }
      const now = Date.now();
      const delta = Math.max(0, now - individualTimer.pausedAt);
      const nextStartedAt = individualTimer.startedAt + delta;
      const nextEndAt = individualTimer.endAt + delta;
      const next: IndividualTimerState = {
        ...individualTimer,
        status: 'running',
        startedAt: nextStartedAt,
        endAt: nextEndAt,
        pausedAt: null,
      };
      setIndividualTimer(next);
      await saveIndividualTimerState(next);
      await scheduleIndividualTimerAlarm({
        durationMinutes: next.durationMinutes,
        triggerAt: nextEndAt,
        settings,
        nowMs: now,
      });
      return;
    }

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
  }, [activeProfile, individualTimer, runtime, settings, slots, syncNotifications, timerMode]);

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

    if (timerMode === 'individual') {
      const next: IndividualTimerState = {
        ...normalizeIndividualForDate(individualTimer, Date.now()),
        status: 'idle',
        startedAt: null,
        endAt: null,
        pausedAt: null,
      };
      setIndividualTimer(next);
      await saveIndividualTimerState(next);
      await cancelAllScheduledAlarms();
      return;
    }

    const next = buildInactiveRuntime(
      activeProfile.id,
      windowKey,
      runtime?.windowKey === windowKey ? runtime.completedFocusMinutesToday : 0,
      runtime?.windowKey === windowKey ? runtime.completedCyclesToday : 0
    );
    setRuntime(next);
    await saveRuntimeState(next);
    await cancelAllScheduledAlarms();
  }, [activeProfile.id, individualTimer, runtime, timerMode, windowKey]);

  const resetDay = useCallback(async () => {
    stopAlarmSound();
    await stopSpeech();
    setActiveAlarm(null);
    handledSlotsRef.current.clear();

    if (timerMode === 'individual') {
      const next = buildDefaultIndividualTimer(Date.now(), individualTimer.durationMinutes);
      setIndividualTimer(next);
      await saveIndividualTimerState(next);
      await cancelAllScheduledAlarms();
      return;
    }

    const next = buildInactiveRuntime(activeProfile.id, windowKey, 0, 0);
    setRuntime(next);
    await saveRuntimeState(next);
    await cancelAllScheduledAlarms();
  }, [activeProfile.id, individualTimer.durationMinutes, timerMode, windowKey]);

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

  const setTimerMode = useCallback(
    async (mode: TimerMode) => {
      if (mode === timerMode) return;
      stopAlarmSound();
      await stopSpeech();
      setActiveAlarm(null);
      handledSlotsRef.current.clear();

      const now = Date.now();
      if (mode === 'individual') {
        if (!isRuntimeHalted(runtime) || runtime?.phase === 'paused' || runtime?.pendingAckType !== null) {
          const inactive = buildInactiveRuntime(
            activeProfile.id,
            windowKey,
            runtime?.windowKey === windowKey ? runtime.completedFocusMinutesToday : 0,
            runtime?.windowKey === windowKey ? runtime.completedCyclesToday : 0
          );
          setRuntime(inactive);
          await saveRuntimeState(inactive);
        }
        const normalized = normalizeIndividualForDate(individualTimer, now);
        setIndividualTimer(normalized);
        await saveIndividualTimerState(normalized);
        await cancelAllScheduledAlarms();
        setTimerModeState('individual');
        await saveTimerMode('individual');
        return;
      }

      if (
        individualTimer.status === 'running' ||
        individualTimer.status === 'paused' ||
        individualTimer.status === 'completed'
      ) {
        const resetInd: IndividualTimerState = {
          ...normalizeIndividualForDate(individualTimer, now),
          status: 'idle',
          startedAt: null,
          endAt: null,
          pausedAt: null,
        };
        setIndividualTimer(resetInd);
        await saveIndividualTimerState(resetInd);
      }
      await cancelAllScheduledAlarms();
      setTimerModeState('profile');
      await saveTimerMode('profile');
    },
    [activeProfile.id, individualTimer, runtime, timerMode, windowKey]
  );

  const setIndividualDuration = useCallback(
    async (minutes: number) => {
      if (individualTimer.status === 'running' || individualTimer.status === 'paused') {
        return;
      }
      const clamped = Math.max(1, Math.min(720, Math.round(minutes)));
      const normalized = normalizeIndividualForDate(individualTimer, Date.now());
      const next: IndividualTimerState = {
        ...normalized,
        durationMinutes: clamped,
        status: 'idle',
        startedAt: null,
        endAt: null,
        pausedAt: null,
      };
      setIndividualTimer(next);
      await saveIndividualTimerState(next);
    },
    [individualTimer]
  );

  const startIndividualTimer = useCallback(
    async (overrideMinutes?: number) => {
      stopAlarmSound();
      await stopSpeech();
      setActiveAlarm(null);
      handledSlotsRef.current.clear();

      const now = Date.now();
      const mins =
        overrideMinutes !== undefined
          ? Math.max(1, Math.min(720, Math.round(overrideMinutes)))
          : individualTimer.durationMinutes;
      const endAt = now + mins * 60_000;

      if (timerMode !== 'individual') {
        if (!isRuntimeHalted(runtime) || runtime?.phase === 'paused' || runtime?.pendingAckType !== null) {
          const inactive = buildInactiveRuntime(
            activeProfile.id,
            windowKey,
            runtime?.windowKey === windowKey ? runtime.completedFocusMinutesToday : 0,
            runtime?.windowKey === windowKey ? runtime.completedCyclesToday : 0
          );
          setRuntime(inactive);
          await saveRuntimeState(inactive);
        }
        setTimerModeState('individual');
        await saveTimerMode('individual');
      }

      const normalized = normalizeIndividualForDate(individualTimer, now);
      const next: IndividualTimerState = {
        ...normalized,
        durationMinutes: mins,
        status: 'running',
        startedAt: now,
        endAt,
        pausedAt: null,
      };
      setIndividualTimer(next);
      await saveIndividualTimerState(next);
      await scheduleIndividualTimerAlarm({
        durationMinutes: mins,
        triggerAt: endAt,
        settings,
        nowMs: now,
      });
    },
    [activeProfile.id, individualTimer, runtime, settings, timerMode, windowKey]
  );

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await saveSettings(next);
      await setupNotificationChannelsAndCategories(next.language);
      if (timerMode === 'individual') {
        if (individualTimer.status === 'running' && individualTimer.endAt !== null) {
          await scheduleIndividualTimerAlarm({
            durationMinutes: individualTimer.durationMinutes,
            triggerAt: individualTimer.endAt,
            settings: next,
          });
        } else {
          await cancelAllScheduledAlarms();
        }
        return;
      }
      await syncNotifications(
        activeProfile,
        slots,
        next,
        runtime?.shiftOffsetMs ?? 0,
        isRuntimeHalted(runtime)
      );
    },
    [activeProfile, individualTimer, runtime, settings, slots, syncNotifications, timerMode]
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
      if (timerMode === 'individual') {
        const resetInd: IndividualTimerState = {
          ...normalizeIndividualForDate(individualTimer, Date.now()),
          status: 'idle',
          startedAt: null,
          endAt: null,
          pausedAt: null,
        };
        setIndividualTimer(resetInd);
        await saveIndividualTimerState(resetInd);
        setTimerModeState('profile');
        await saveTimerMode('profile');
      }
      await applyNewProfilesAndResync(next, settings, startImmediately);
    },
    [applyNewProfilesAndResync, individualTimer, profiles, settings, timerMode]
  );

  const setActiveProfileId = useCallback(
    async (id: string) => {
      const next = profiles.map((p) => ({ ...p, isActive: p.id === id }));
      setProfiles(next);
      await saveProfiles(next);
      if (timerMode === 'individual') {
        const resetInd: IndividualTimerState = {
          ...normalizeIndividualForDate(individualTimer, Date.now()),
          status: 'idle',
          startedAt: null,
          endAt: null,
          pausedAt: null,
        };
        setIndividualTimer(resetInd);
        await saveIndividualTimerState(resetInd);
        setTimerModeState('profile');
        await saveTimerMode('profile');
      }
      await applyNewProfilesAndResync(next, settings);
    },
    [applyNewProfilesAndResync, individualTimer, profiles, settings, timerMode]
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
    if (timerMode === 'individual') {
      await triggerAlarm(
        {
          type: 'individual_complete',
          slotIndex: 0,
          cumulativeFocusMinutes: individualTimer.durationMinutes,
          restMinutes: 0,
          triggeredAt: Date.now(),
        },
        settings
      );
      return;
    }

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
  }, [
    activeProfile.focusMinutes,
    activeProfile.restMinutes,
    individualTimer.durationMinutes,
    runtime,
    settings,
    timerMode,
    triggerAlarm,
  ]);

  const bumpStatsRevision = useCallback(() => {
    setStatsRevision((v) => v + 1);
  }, []);

  const openSettingsModal = useCallback(() => {
    void refreshPermissions();
    setSettingsModalVisible(true);
  }, [refreshPermissions]);

  const closeSettingsModal = useCallback(() => {
    setSettingsModalVisible(false);
  }, []);

  const hasMissingPermissions =
    Platform.OS !== 'web' &&
    (!notificationsGranted || (Platform.OS === 'android' && !exactAlarmGranted));

  const shift = runtime?.shiftOffsetMs ?? 0;
  const currentSlot =
    timerMode === 'profile' && runtime ? (slots[runtime.currentSlotIndex] ?? null) : null;

  let phase: TimerPhase = runtime?.phase ?? 'inactive';
  let remainingMs = 0;
  let progress = 0;
  let nextAlarmAt: number | null = null;

  if (timerMode === 'individual') {
    if (
      individualTimer.status === 'running' &&
      individualTimer.startedAt !== null &&
      individualTimer.endAt !== null
    ) {
      phase = 'focusing';
      const total = Math.max(1, individualTimer.endAt - individualTimer.startedAt);
      remainingMs = Math.max(0, individualTimer.endAt - nowMs);
      progress = Math.min(1, Math.max(0, (nowMs - individualTimer.startedAt) / total));
      nextAlarmAt = individualTimer.endAt;
    } else if (
      individualTimer.status === 'paused' &&
      individualTimer.startedAt !== null &&
      individualTimer.endAt !== null &&
      individualTimer.pausedAt !== null
    ) {
      phase = 'paused';
      const total = Math.max(1, individualTimer.endAt - individualTimer.startedAt);
      remainingMs = Math.max(0, individualTimer.endAt - individualTimer.pausedAt);
      progress = Math.min(
        1,
        Math.max(0, (individualTimer.pausedAt - individualTimer.startedAt) / total)
      );
    } else if (individualTimer.status === 'completed') {
      phase = 'completed_range';
      remainingMs = 0;
      progress = 1;
    } else {
      phase = 'inactive';
      remainingMs = Math.max(1, individualTimer.durationMinutes) * 60_000;
      progress = 0;
    }
  } else if (currentSlot && (phase === 'focusing' || phase === 'resting' || phase === 'paused')) {
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

  const todayKey = getLocalDateKey(nowMs);
  const todayFocusMinutes =
    timerMode === 'individual'
      ? individualTimer.dateKey === todayKey
        ? individualTimer.completedFocusMinutesToday
        : 0
      : (runtime?.completedFocusMinutesToday ?? 0);
  const completedCyclesToday =
    timerMode === 'individual'
      ? individualTimer.dateKey === todayKey
        ? individualTimer.completedCyclesToday
        : 0
      : (runtime?.completedCyclesToday ?? 0);

  const value: FocusContextValue = {
    ready,
    nowMs,
    settings,
    t: translations[settings.language],
    timerMode,
    individualTimer,
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
    todayFocusMinutes,
    completedCyclesToday,
    nextAlarmAt,
    activeAlarm,
    statsRevision,
    settingsModalVisible,
    notificationsGranted,
    exactAlarmGranted,
    hasMissingPermissions,
    openSettingsModal,
    closeSettingsModal,
    setNotificationsGrantedState: setNotificationsGranted,
    setExactAlarmGrantedState: setExactAlarmGranted,
    refreshPermissions,
    updateSettings,
    setTimerMode,
    setIndividualDuration,
    startIndividualTimer,
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
