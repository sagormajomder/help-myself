import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';

import type {
  AppSettings,
  DailyStatsSummary,
  FocusProfile,
  FocusSessionLog,
  IndividualTimerState,
  RuntimeTimerState,
  TimerMode,
} from '@/types/focus';
import { getLocalDateKey } from '@/utils/schedule-calculator';

const KEYS = {
  SETTINGS: 'hm_app_settings_v1',
  PROFILES: 'hm_focus_profiles_v1',
  RUNTIME: 'hm_runtime_state_v1',
  TIMER_MODE: 'hm_timer_mode_v1',
  INDIVIDUAL_TIMER: 'hm_individual_timer_v1',
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'bn',
  autoContinue: true,
  soundEnabled: true,
  voiceEnabled: true,
  vibrationEnabled: true,
};

export const DEFAULT_PROFILES: FocusProfile[] = [
  {
    id: 'office-focus',
    name: 'Office Focus',
    startMinuteOfDay: 10 * 60, // 10:00 AM
    endMinuteOfDay: 17 * 60, // 5:00 PM
    focusMinutes: 60,
    restMinutes: 5,
    activeDays: [0, 1, 2, 3, 4], // Sun - Thu
    isActive: true,
  },
  {
    id: 'night-study',
    name: 'Night Study',
    startMinuteOfDay: 20 * 60, // 8:00 PM
    endMinuteOfDay: 23 * 60, // 11:00 PM
    focusMinutes: 30,
    restMinutes: 5,
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    isActive: false,
  },
];

let dbPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;
const memoryWebStore = new Map<string, string>();
let webLogs: FocusSessionLog[] = [];

async function getKvItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return typeof window !== 'undefined' && window.localStorage
        ? window.localStorage.getItem(key)
        : (memoryWebStore.get(key) ?? null);
    } catch {
      return memoryWebStore.get(key) ?? null;
    }
  }
  return Storage.getItem(key);
}

async function setKvItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // Fallback to in-memory map on restricted web contexts
    }
    memoryWebStore.set(key, value);
    return;
  }
  await Storage.setItem(key, value);
}

async function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('help_myself.db');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS focus_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          date_key TEXT NOT NULL,
          profile_id TEXT NOT NULL,
          profile_name TEXT NOT NULL,
          focus_minutes INTEGER NOT NULL,
          completed_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_focus_sessions_date ON focus_sessions(date_key);
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function initStorage(): Promise<void> {
  await getDb();
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await getKvItem(KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await setKvItem(KEYS.SETTINGS, JSON.stringify(settings));
}

export async function loadProfiles(): Promise<FocusProfile[]> {
  try {
    const raw = await getKvItem(KEYS.PROFILES);
    if (!raw) return DEFAULT_PROFILES;
    const parsed = JSON.parse(raw) as FocusProfile[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PROFILES;
    return parsed;
  } catch {
    return DEFAULT_PROFILES;
  }
}

export async function saveProfiles(profiles: FocusProfile[]): Promise<void> {
  await setKvItem(KEYS.PROFILES, JSON.stringify(profiles));
}

export async function loadRuntimeState(): Promise<RuntimeTimerState | null> {
  try {
    const raw = await getKvItem(KEYS.RUNTIME);
    if (!raw) return null;
    return JSON.parse(raw) as RuntimeTimerState;
  } catch {
    return null;
  }
}

export async function saveRuntimeState(state: RuntimeTimerState | null): Promise<void> {
  if (!state) {
    await setKvItem(KEYS.RUNTIME, '');
    return;
  }
  await setKvItem(KEYS.RUNTIME, JSON.stringify(state));
}

export async function loadTimerMode(): Promise<TimerMode> {
  try {
    const raw = await getKvItem(KEYS.TIMER_MODE);
    return raw === 'individual' ? 'individual' : 'profile';
  } catch {
    return 'profile';
  }
}

export async function saveTimerMode(mode: TimerMode): Promise<void> {
  await setKvItem(KEYS.TIMER_MODE, mode);
}

export async function loadIndividualTimerState(): Promise<IndividualTimerState | null> {
  try {
    const raw = await getKvItem(KEYS.INDIVIDUAL_TIMER);
    if (!raw) return null;
    return JSON.parse(raw) as IndividualTimerState;
  } catch {
    return null;
  }
}

export async function saveIndividualTimerState(
  state: IndividualTimerState | null
): Promise<void> {
  if (!state) {
    await setKvItem(KEYS.INDIVIDUAL_TIMER, '');
    return;
  }
  await setKvItem(KEYS.INDIVIDUAL_TIMER, JSON.stringify(state));
}

export async function insertFocusSessionLog(log: FocusSessionLog): Promise<void> {
  const db = await getDb();
  if (!db) {
    webLogs = [log, ...webLogs.filter((item) => item.id !== log.id)];
    return;
  }
  await db.runAsync(
    `INSERT OR IGNORE INTO focus_sessions (id, date_key, profile_id, profile_name, focus_minutes, completed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [log.id, log.dateKey, log.profileId, log.profileName, log.focusMinutes, log.completedAt]
  );
}

export async function getRecentSessionLogs(limit: number = 40): Promise<FocusSessionLog[]> {
  const db = await getDb();
  if (!db) {
    return webLogs.slice(0, limit);
  }
  const rows = await db.getAllAsync<{
    id: string;
    date_key: string;
    profile_id: string;
    profile_name: string;
    focus_minutes: number;
    completed_at: number;
  }>(
    `SELECT id, date_key, profile_id, profile_name, focus_minutes, completed_at
     FROM focus_sessions
     ORDER BY completed_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    dateKey: r.date_key,
    profileId: r.profile_id,
    profileName: r.profile_name,
    focusMinutes: r.focus_minutes,
    completedAt: r.completed_at,
  }));
}

export async function getDailyStatsLastNDays(days: number = 7): Promise<DailyStatsSummary[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateKeys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dateKeys.push(getLocalDateKey(d.getTime()));
  }

  const db = await getDb();
  const map = new Map<string, DailyStatsSummary>();
  for (const key of dateKeys) {
    map.set(key, { dateKey: key, totalFocusMinutes: 0, cyclesCount: 0 });
  }

  if (!db) {
    for (const log of webLogs) {
      const entry = map.get(log.dateKey);
      if (entry) {
        entry.totalFocusMinutes += log.focusMinutes;
        entry.cyclesCount += 1;
      }
    }
    return dateKeys.map((k) => map.get(k)!);
  }

  const minDateKey = dateKeys[0];
  const rows = await db.getAllAsync<{
    date_key: string;
    total_minutes: number;
    cycles_count: number;
  }>(
    `SELECT date_key, COALESCE(SUM(focus_minutes), 0) AS total_minutes, COUNT(*) AS cycles_count
     FROM focus_sessions
     WHERE date_key >= ?
     GROUP BY date_key`,
    [minDateKey]
  );

  for (const r of rows) {
    const entry = map.get(r.date_key);
    if (entry) {
      entry.totalFocusMinutes = r.total_minutes;
      entry.cyclesCount = r.cycles_count;
    }
  }

  return dateKeys.map((k) => map.get(k)!);
}

export async function getAllTimeTotals(): Promise<{
  totalMinutes: number;
  totalCycles: number;
  currentStreakDays: number;
}> {
  const db = await getDb();
  if (!db) {
    const totalMinutes = webLogs.reduce((acc, item) => acc + item.focusMinutes, 0);
    return {
      totalMinutes,
      totalCycles: webLogs.length,
      currentStreakDays: webLogs.length > 0 ? 1 : 0,
    };
  }

  const totals = await db.getFirstAsync<{ total_minutes: number; total_cycles: number }>(
    `SELECT COALESCE(SUM(focus_minutes), 0) AS total_minutes, COUNT(*) AS total_cycles FROM focus_sessions`
  );

  const distinctDays = await db.getAllAsync<{ date_key: string }>(
    `SELECT DISTINCT date_key FROM focus_sessions ORDER BY date_key DESC LIMIT 60`
  );

  let streak = 0;
  if (distinctDays.length > 0) {
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    const daySet = new Set(distinctDays.map((d) => d.date_key));

    // Allow streak to start from today OR yesterday if today has no completed session yet
    if (!daySet.has(getLocalDateKey(cursor.getTime()))) {
      cursor.setDate(cursor.getDate() - 1);
    }

    while (daySet.has(getLocalDateKey(cursor.getTime()))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  return {
    totalMinutes: totals?.total_minutes ?? 0,
    totalCycles: totals?.total_cycles ?? 0,
    currentStreakDays: streak,
  };
}

export async function clearAllSessionLogs(): Promise<void> {
  const db = await getDb();
  if (!db) {
    webLogs = [];
    return;
  }
  await db.runAsync('DELETE FROM focus_sessions');
}
