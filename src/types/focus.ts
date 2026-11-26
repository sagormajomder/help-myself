export type AppLanguage = 'bn' | 'en';

export interface AppSettings {
  language: AppLanguage;
  autoContinue: boolean;
  soundEnabled: boolean;
  voiceEnabled: boolean;
  vibrationEnabled: boolean;
}

export interface FocusProfile {
  id: string;
  name: string;
  /** Local minute of day (0 - 1439), e.g. 10:00 AM = 600 */
  startMinuteOfDay: number;
  /** Local minute of day (0 - 1439), e.g. 5:00 PM = 1020. If <= startMinuteOfDay, treated as overnight range. */
  endMinuteOfDay: number;
  /** Focus duration per cycle in minutes (min 1) */
  focusMinutes: number;
  /** Rest duration after each focus cycle in minutes (0 = skip rest) */
  restMinutes: number;
  /** JS Date.getDay() values: 0 = Sun, 1 = Mon, ..., 6 = Sat */
  activeDays: number[];
  isActive: boolean;
}

export type SlotType = 'focus' | 'rest';

export interface TimelineSlot {
  index: number;
  type: SlotType;
  startAt: number;
  endAt: number;
  durationMinutes: number;
  /** Total focus minutes accumulated at the end of this slot within the current window */
  cumulativeFocusMinutes: number;
}

export interface WindowSchedule {
  windowStartAt: number;
  windowEndAt: number;
  slots: TimelineSlot[];
}

export type TimerPhase =
  | 'inactive'
  | 'outside_range'
  | 'focusing'
  | 'resting'
  | 'paused'
  | 'awaiting_rest_ack'
  | 'awaiting_focus_ack'
  | 'completed_range';

export interface RuntimeTimerState {
  profileId: string;
  windowKey: string;
  phase: TimerPhase;
  currentSlotIndex: number;
  /** Timestamp when paused (ms), if currently paused */
  pausedAt: number | null;
  /** Accumulated pause/snooze shift in ms applied to slots from currentSlotIndex onward */
  shiftOffsetMs: number;
  /** Original slot index when awaiting manual ack */
  pendingAckType: 'rest' | 'focus' | null;
  /** Extra focus minutes completed before current pause/ack */
  completedFocusMinutesToday: number;
  /** Number of focus cycles completed in current window */
  completedCyclesToday: number;
  /** Whether the user explicitly started focus for this window */
  startedByUser?: boolean;
}

export interface FocusSessionLog {
  id: string;
  dateKey: string; // YYYY-MM-DD in local time
  profileId: string;
  profileName: string;
  focusMinutes: number;
  completedAt: number;
}

export interface DailyStatsSummary {
  dateKey: string;
  totalFocusMinutes: number;
  cyclesCount: number;
}

export interface AlarmEvent {
  type: 'focus_complete' | 'rest_complete' | 'range_complete';
  slotIndex: number;
  cumulativeFocusMinutes: number;
  restMinutes: number;
  triggeredAt: number;
}
