import type { ParticipantRole } from './types';

// Madinah Mushaf Juz page ranges (604 pages total)
// Uses startPage/endPage to avoid collision with JS reserved words
export const JUZ_PAGE_RANGES: Record<number, { startPage: number; endPage: number }> = {
  1: { startPage: 1, endPage: 21 }, 2: { startPage: 22, endPage: 41 },
  3: { startPage: 42, endPage: 61 }, 4: { startPage: 62, endPage: 81 },
  5: { startPage: 82, endPage: 101 }, 6: { startPage: 102, endPage: 121 },
  7: { startPage: 122, endPage: 141 }, 8: { startPage: 142, endPage: 161 },
  9: { startPage: 162, endPage: 181 }, 10: { startPage: 182, endPage: 201 },
  11: { startPage: 202, endPage: 221 }, 12: { startPage: 222, endPage: 241 },
  13: { startPage: 242, endPage: 261 }, 14: { startPage: 262, endPage: 281 },
  15: { startPage: 282, endPage: 301 }, 16: { startPage: 302, endPage: 321 },
  17: { startPage: 322, endPage: 341 }, 18: { startPage: 342, endPage: 361 },
  19: { startPage: 362, endPage: 381 }, 20: { startPage: 382, endPage: 401 },
  21: { startPage: 402, endPage: 421 }, 22: { startPage: 422, endPage: 441 },
  23: { startPage: 442, endPage: 461 }, 24: { startPage: 462, endPage: 481 },
  25: { startPage: 482, endPage: 501 }, 26: { startPage: 502, endPage: 521 },
  27: { startPage: 522, endPage: 541 }, 28: { startPage: 542, endPage: 561 },
  29: { startPage: 562, endPage: 581 }, 30: { startPage: 582, endPage: 604 },
};

// Arabic opening words for each Juz (Uthmani script)
export const JUZ_ARABIC_NAMES: Record<number, string> = {
  1: '\u0627\u0644\u0645',
  2: '\u0633\u064E\u064A\u064E\u0642\u064F\u0648\u0644\u064F',
  3: '\u062A\u0650\u0644\u0652\u0643\u064E \u0627\u0644\u0631\u0651\u064F\u0633\u064F\u0644\u064F',
  4: '\u0644\u064E\u0646\u0652 \u062A\u064E\u0646\u064E\u0627\u0644\u064F\u0648\u0627',
  5: '\u0648\u064E\u0627\u0644\u0652\u0645\u064F\u062D\u0652\u0635\u064E\u0646\u064E\u0627\u062A\u064F',
  6: '\u0644\u064E\u0627 \u064A\u064F\u062D\u0650\u0628\u0651\u064F \u0627\u0644\u0644\u0651\u064E\u0647\u064F',
  7: '\u0648\u064E\u0625\u0650\u0630\u064E\u0627 \u0633\u064E\u0645\u0650\u0639\u064F\u0648\u0627',
  8: '\u0648\u064E\u0644\u064E\u0648\u0652 \u0623\u064E\u0646\u0651\u064E\u0646\u064E\u0627',
  9: '\u0642\u064E\u0627\u0644\u064E \u0627\u0644\u0652\u0645\u064E\u0644\u064E\u0623\u064F',
  10: '\u0648\u064E\u0627\u0639\u0652\u0644\u064E\u0645\u064F\u0648\u0627',
  11: '\u064A\u064E\u0639\u0652\u062A\u064E\u0630\u0650\u0631\u064F\u0648\u0646\u064E',
  12: '\u0648\u064E\u0645\u064E\u0627 \u0645\u0650\u0646\u0652 \u062F\u064E\u0627\u0628\u0651\u064E\u0629\u064D',
  13: '\u0648\u064E\u0645\u064E\u0627 \u0623\u064F\u0628\u064E\u0631\u0651\u0650\u0626\u064F',
  14: '\u0631\u064F\u0628\u064E\u0645\u064E\u0627',
  15: '\u0633\u064F\u0628\u0652\u062D\u064E\u0627\u0646\u064E \u0627\u0644\u0651\u064E\u0630\u0650\u064A',
  16: '\u0642\u064E\u0627\u0644\u064E \u0623\u064E\u0644\u064E\u0645\u0652',
  17: '\u0627\u0642\u0652\u062A\u064E\u0631\u064E\u0628\u064E \u0644\u0650\u0644\u0646\u0651\u064E\u0627\u0633\u0650',
  18: '\u0642\u064E\u062F\u0652 \u0623\u064E\u0641\u0652\u0644\u064E\u062D\u064E',
  19: '\u0648\u064E\u0642\u064E\u0627\u0644\u064E \u0627\u0644\u0651\u064E\u0630\u0650\u064A\u0646\u064E',
  20: '\u0623\u064E\u0645\u0651\u064E\u0646\u0652 \u062E\u064E\u0644\u064E\u0642\u064E',
  21: '\u0627\u062A\u0652\u0644\u064F \u0645\u064E\u0627 \u0623\u064F\u0648\u062D\u0650\u064A\u064E',
  22: '\u0648\u064E\u0645\u064E\u0646\u0652 \u064A\u064E\u0642\u0652\u0646\u064F\u062A\u0652',
  23: '\u0648\u064E\u0645\u064E\u0627 \u0644\u0650\u064A\u064E',
  24: '\u0641\u064E\u0645\u064E\u0646\u0652 \u0623\u064E\u0638\u0652\u0644\u064E\u0645\u064F',
  25: '\u0625\u0650\u0644\u064E\u064A\u0652\u0647\u0650 \u064A\u064F\u0631\u064E\u062F\u0651\u064F',
  26: '\u062D\u0645',
  27: '\u0642\u064E\u0627\u0644\u064E \u0641\u064E\u0645\u064E\u0627 \u062E\u064E\u0637\u0652\u0628\u064F\u0643\u064F\u0645\u0652',
  28: '\u0642\u064E\u062F\u0652 \u0633\u064E\u0645\u0650\u0639\u064E \u0627\u0644\u0644\u0651\u064E\u0647\u064F',
  29: '\u062A\u064E\u0628\u064E\u0627\u0631\u064E\u0643\u064E \u0627\u0644\u0651\u064E\u0630\u0650\u064A',
  30: '\u0639\u064E\u0645\u0651\u064E \u064A\u064E\u062A\u064E\u0633\u064E\u0627\u0621\u064E\u0644\u064F\u0648\u0646\u064E',
};

// Leading Surah name per Juz (for display in English UI)
export const JUZ_ENGLISH_NAMES: Record<number, string> = {
  1: 'Al-Baqarah', 2: 'Al-Baqarah', 3: 'Al-Baqarah',
  4: "Al-'Imran", 5: "An-Nisa'", 6: "An-Nisa'",
  7: "Al-Ma'idah", 8: "Al-An'am", 9: "Al-A'raf",
  10: 'Al-Anfal', 11: 'Yunus', 12: 'Hud',
  13: 'Ibrahim', 14: 'Al-Hijr', 15: "Al-Isra'",
  16: 'Al-Kahf', 17: 'Al-Anbiya', 18: "Al-Mu'minun",
  19: 'Al-Furqan', 20: 'An-Naml', 21: "Al-'Ankabut",
  22: 'Al-Ahzab', 23: 'Ya-Sin', 24: 'Az-Zumar',
  25: 'Fussilat', 26: 'Al-Ahqaf', 27: 'Adh-Dhariyat',
  28: 'Al-Mujadila', 29: 'Al-Mulk', 30: "An-Naba'",
};

// Design system tokens (from Iqra app at staging.hikkmah.com/iqra)
export const KHATM_COLORS = {
  primary: '#117A7A',
  cardBg: '#D7F2E582',
  pageBgLight: '#FFFFFF',
  pageBgAlt: '#F8FAFB',
  textPrimary: '#222934',
  textSecondary: '#393D43',
  tealTint: '#D7F2E5',
  gold: '#C8921A',
  // Dark mode
  darkBg: '#121212',
  darkCard: '#2A2A2A82',
} as const;

// Permission matrix — who can perform which actions
export const CAN_ASSIGN_JUZ: readonly ParticipantRole[] = ['ADMIN', 'CO_ADMIN'] as const;
export const CAN_REASSIGN_JUZ: readonly ParticipantRole[] = ['ADMIN', 'CO_ADMIN'] as const;
export const CAN_MANAGE_INVITES: readonly ParticipantRole[] = ['ADMIN', 'CO_ADMIN'] as const;
export const CAN_RECORD_PROXY_PROGRESS: readonly ParticipantRole[] = ['ADMIN', 'CO_ADMIN'] as const;
export const CAN_SEND_REMINDERS: readonly ParticipantRole[] = ['ADMIN', 'CO_ADMIN'] as const;
export const CAN_PROMOTE_COADMIN: readonly ParticipantRole[] = ['ADMIN'] as const;
export const CAN_DELETE_GROUP: readonly ParticipantRole[] = ['ADMIN'] as const;

// Stall detection thresholds (days)
export const STALL_THRESHOLDS = {
  /** Days after assignment before an unstarted Juz is considered stalled */
  juz_not_started_days: 3,
  /** Days since last progress update before an in-progress Juz is considered stalled */
  in_progress_no_update_days: 4,
} as const;

// Default reminder schedule windows (days before end_date)
export const DEFAULT_REMINDER_WINDOWS = [5, 2, 1] as const;

/**
 * Invite code charset — deliberately excludes O, 0, 1, I to prevent
 * visual ambiguity when users read the code aloud or transcribe it.
 */
export const INVITE_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;
