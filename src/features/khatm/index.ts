// ── Constants (value exports) ─────────────────────────────────────────────
export {
  KHATM_COLORS,
  JUZ_PAGE_RANGES,
  JUZ_ARABIC_NAMES,
  JUZ_ENGLISH_NAMES,
  CAN_ASSIGN_JUZ,
  CAN_REASSIGN_JUZ,
  CAN_MANAGE_INVITES,
  CAN_RECORD_PROXY_PROGRESS,
  CAN_SEND_REMINDERS,
  CAN_PROMOTE_COADMIN,
  CAN_DELETE_GROUP,
  STALL_THRESHOLDS,
  DEFAULT_REMINDER_WINDOWS,
  INVITE_CODE_CHARSET,
  INVITE_CODE_LENGTH,
} from './constants';

// ── Types (type-only exports) ─────────────────────────────────────────────
export type {
  OccasionType,
  GroupLanguage,
  AssignmentMode,
  GroupStatus,
  ParticipantRole,
  ParticipantStatus,
  JuzStatus,
  ProgressSource,
  KhatmGroup,
  KhatmParticipant,
  KhatmJuzAssignment,
  KhatmProgressUpdate,
  KhatmReminderSchedule,
  KhatmAuditLog,
  JuzTileData,
  JuzTileAssignment,
  KhatmScreenData,
  KhatmReadingContext,
  CreateKhatmInput,
  AdminSummaryData,
  StalledAssignment,
} from './types';

// ── Store ─────────────────────────────────────────────────────────────────
export { useKhatmStore } from './store';

// ── Query hooks ───────────────────────────────────────────────────────────
export {
  khatmKeys,
  useKhatmGroups,
  useKhatmScreen,
  useKhatmRealtime,
} from './hooks/useKhatmQueries';

// ── Mutation hooks ────────────────────────────────────────────────────────
export {
  useCreateKhatm,
  useAssignJuz,
  useClaimJuz,
  useUpdateProgress,
  useAssignRole,
  useJoinKhatm,
  useStartNewCycle,
  useUpdateGroupSettings,
} from './hooks/useKhatmMutations';

export type {
  AssignJuzInput,
  ClaimJuzInput,
  UpdateProgressInput,
  AssignRoleInput,
  UpdateGroupSettingsInput,
} from './hooks/useKhatmMutations';

// ── Auto-tracking hook ────────────────────────────────────────────────────
export { useAutoTracking } from './hooks/useAutoTracking';

// ── Navigator ─────────────────────────────────────────────────────────────
export { KhatmStackNavigator } from './navigation';
export type { KhatmStackParamList } from './navigation';
