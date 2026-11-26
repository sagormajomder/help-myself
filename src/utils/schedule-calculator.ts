import type { FocusProfile, TimelineSlot, WindowSchedule } from '@/types/focus';

const MS_PER_MIN = 60_000;
const MINUTES_PER_DAY = 24 * 60;

/** Returns local YYYY-MM-DD key for a timestamp */
export function getLocalDateKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Formats minute-of-day (0..1439) to localized 12h time string e.g. "10:00 AM" */
export function formatMinuteOfDay(minuteOfDay: number): string {
  const normalized = ((Math.round(minuteOfDay) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${period}`;
}

/** Formats epoch ms to local clock time like "11:05 AM" */
export function formatClockTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  return formatMinuteOfDay(d.getHours() * 60 + d.getMinutes());
}

/** Formats countdown milliseconds as MM:SS or HH:MM:SS */
export function formatCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/** Returns local midnight timestamp (00:00:00.000) for a given timestamp */
function getLocalMidnight(timestampMs: number): Date {
  const d = new Date(timestampMs);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Resolves the active or upcoming local window [windowStartAt, windowEndAt] for a profile.
 * Handles both same-day ranges (e.g. 10:00-17:00) and overnight ranges (e.g. 22:00-03:00).
 */
export function resolveProfileWindow(
  profile: FocusProfile,
  nowMs: number = Date.now()
): { windowStartAt: number; windowEndAt: number; isActiveDay: boolean } | null {
  if (profile.activeDays.length === 0) return null;

  const isOvernight = profile.endMinuteOfDay <= profile.startMinuteOfDay;
  const durationMinutes = isOvernight
    ? MINUTES_PER_DAY - profile.startMinuteOfDay + profile.endMinuteOfDay
    : profile.endMinuteOfDay - profile.startMinuteOfDay;

  if (durationMinutes <= 0) return null;

  const todayMidnight = getLocalMidnight(nowMs);

  // Check yesterday's window first if overnight (it might still be running past midnight)
  if (isOvernight) {
    const yesterdayMidnight = new Date(todayMidnight);
    yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);
    const yesterdayDay = yesterdayMidnight.getDay();
    if (profile.activeDays.includes(yesterdayDay)) {
      const yStart = yesterdayMidnight.getTime() + profile.startMinuteOfDay * MS_PER_MIN;
      const yEnd = yStart + durationMinutes * MS_PER_MIN;
      if (nowMs < yEnd) {
        return { windowStartAt: yStart, windowEndAt: yEnd, isActiveDay: true };
      }
    }
  }

  // Check today's window
  const todayDay = todayMidnight.getDay();
  const todayStart = todayMidnight.getTime() + profile.startMinuteOfDay * MS_PER_MIN;
  const todayEnd = todayStart + durationMinutes * MS_PER_MIN;

  if (profile.activeDays.includes(todayDay) && nowMs < todayEnd) {
    return { windowStartAt: todayStart, windowEndAt: todayEnd, isActiveDay: true };
  }

  // Otherwise find next upcoming active day (1..7 days ahead)
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = new Date(todayMidnight);
    candidate.setDate(candidate.getDate() + offset);
    if (profile.activeDays.includes(candidate.getDay())) {
      const cStart = candidate.getTime() + profile.startMinuteOfDay * MS_PER_MIN;
      const cEnd = cStart + durationMinutes * MS_PER_MIN;
      return {
        windowStartAt: cStart,
        windowEndAt: cEnd,
        isActiveDay: profile.activeDays.includes(todayDay),
      };
    }
  }

  return null;
}

/**
 * Generates alternating focus and rest slots inside [windowStartAt, windowEndAt].
 * Clips the final slot at windowEndAt if remaining time is shorter than a full interval.
 */
export function buildWindowSchedule(
  profile: FocusProfile,
  windowStartAt: number,
  windowEndAt: number
): WindowSchedule {
  const focusMs = Math.max(1, profile.focusMinutes) * MS_PER_MIN;
  const restMs = Math.max(0, profile.restMinutes) * MS_PER_MIN;

  const slots: TimelineSlot[] = [];
  let cursor = windowStartAt;
  let cumulativeFocusMinutes = 0;
  let index = 0;

  // Safety cap to prevent excessive slots even with 1-min intervals over 24h
  const MAX_SLOTS = 300;

  while (cursor < windowEndAt && slots.length < MAX_SLOTS) {
    const focusEnd = Math.min(cursor + focusMs, windowEndAt);
    const focusDurMin = Math.max(1, Math.round((focusEnd - cursor) / MS_PER_MIN));
    cumulativeFocusMinutes += focusDurMin;

    slots.push({
      index,
      type: 'focus',
      startAt: cursor,
      endAt: focusEnd,
      durationMinutes: focusDurMin,
      cumulativeFocusMinutes,
    });
    index += 1;
    cursor = focusEnd;

    if (cursor >= windowEndAt) break;

    if (restMs > 0) {
      const restEnd = Math.min(cursor + restMs, windowEndAt);
      const restDurMin = Math.max(1, Math.round((restEnd - cursor) / MS_PER_MIN));
      slots.push({
        index,
        type: 'rest',
        startAt: cursor,
        endAt: restEnd,
        durationMinutes: restDurMin,
        cumulativeFocusMinutes,
      });
      index += 1;
      cursor = restEnd;
    }
  }

  return {
    windowStartAt,
    windowEndAt,
    slots,
  };
}

/**
 * Returns the slot active at `nowMs` (accounting for optional `shiftOffsetMs`), or null if outside.
 */
export function findSlotAtTime(
  slots: TimelineSlot[],
  nowMs: number,
  shiftOffsetMs: number = 0
): TimelineSlot | null {
  for (const slot of slots) {
    const start = slot.startAt + shiftOffsetMs;
    const end = slot.endAt + shiftOffsetMs;
    if (nowMs >= start && nowMs < end) {
      return slot;
    }
  }
  return null;
}

/** Creates a deterministic key for a window (used to detect day/range rollover) */
export function getWindowKey(profileId: string, windowStartAt: number): string {
  return `${profileId}:${getLocalDateKey(windowStartAt)}:${windowStartAt}`;
}
