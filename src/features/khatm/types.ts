// ---------------------------------------------------------------------------
// T-01: Shared Types for the Group Khatm feature
// Pure types file — no runtime code, no imports of runtime modules.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

export type OccasionType = 'GENERAL' | 'MEMORIAL' | 'RAMADAN' | 'EID' | 'SHIFA' | 'CUSTOM';

export type GroupLanguage = 'AR' | 'EN' | 'UR' | 'TR' | 'FR' | 'ID' | 'MS';

export type AssignmentMode = 'ADMIN' | 'PARTICIPANT';

export type GroupStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export type ParticipantRole = 'ADMIN' | 'CO_ADMIN' | 'PARTICIPANT';

export type ParticipantStatus = 'INVITED' | 'JOINED' | 'REMOVED' | 'LEFT';

export type JuzStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED';

export type ProgressSource = 'IN_APP' | 'AUTO_TRACKING' | 'ADMIN_OVERRIDE';

// ---------------------------------------------------------------------------
// Interfaces (exported as `export type` for isolatedModules compatibility)
// ---------------------------------------------------------------------------

export type KhatmGroup = {
  id: string;
  title: string;
  intention: string | null;
  occasion_type: OccasionType;
  dedicated_to_name: string | null;
  dedicated_to_relationship: string | null;
  start_date: string;        // ISO date YYYY-MM-DD
  end_date: string;          // ISO date YYYY-MM-DD
  timezone: string;          // IANA timezone
  language: GroupLanguage;
  assignment_mode: AssignmentMode;
  max_per_juz: number;       // smallint, default 1, v1 max 2
  allow_juz_switch: boolean;
  invite_code: string;       // 8-char alphanumeric
  status: GroupStatus;
  admin_user_id: string;
  khatm_cycle: number;       // smallint, default 1
  created_at: string;
  /** Set by DB trigger when all 30 Juz reach COMPLETED */
  completed_at: string | null;
};

export type KhatmParticipant = {
  id: string;
  group_id: string;
  user_id: string | null;    // null for non-app users not yet joined
  name: string;
  contact_type: string;      // 'PHONE' | 'EMAIL'
  contact_value: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  joined_at: string | null;
  last_active_at: string | null;
};

export type KhatmJuzAssignment = {
  id: string;
  group_id: string;
  participant_id: string;
  juz_number: number;        // 1-30
  status: JuzStatus;
  progress_percent: number;  // 0-100
  last_note: string | null;
  assigned_at: string;
  /** SET BY TRIGGER when progress_percent first > 0 */
  started_at: string | null;
  /** SET BY TRIGGER when progress_percent = 100 */
  completed_at: string | null;
  /** SET BY TRIGGER on every update */
  last_updated_at: string;
  assigned_by: string | null; // participant_id of assigner
};

export type KhatmProgressUpdate = {
  id: string;
  assignment_id: string;
  participant_id: string;
  progress_percent: number;
  previous_percent: number;
  note: string | null;
  source: ProgressSource;
  created_at: string;
};

export type KhatmReminderSchedule = {
  id: string;
  group_id: string;
  days_before: number;
  label: string | null;
  is_active: boolean;
  created_at: string;
};

export type KhatmAuditLog = {
  id: string;
  group_id: string;
  actor_participant_id: string | null;
  action_type: string;
  target_entity_type: string | null;
  target_entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
};

export type JuzTileAssignment = {
  assignment_id: string;
  participant_id: string;
  participant_name: string;
  progress_percent: number;
  status: JuzStatus;
  /** ISO timestamp — set by DB trigger on every khatm_juz_assignments update */
  last_updated_at: string;
};

export type JuzTileData = {
  juz_number: number;
  arabic_name: string;       // from JUZ_ARABIC_NAMES constant
  assignments: JuzTileAssignment[];
  display_status: 'open' | 'assigned' | 'in_progress' | 'completed';
};

export type KhatmScreenData = {
  group: KhatmGroup;
  participants: KhatmParticipant[];
  /** Always 30 items, one per Juz */
  juz_tiles: JuzTileData[];
  my_participant: KhatmParticipant | null;
  completed_count: number;   // 0-30
};

export type KhatmReadingContext = {
  groupId: string;
  participantId: string;
  juzNumber: number;
  startPage: number;
  endPage: number;
};

export type CreateKhatmInput = {
  title: string;
  intention?: string;
  occasion_type: OccasionType;
  dedicated_to_name?: string;
  dedicated_to_relationship?: string;
  start_date: string;
  end_date: string;
  timezone: string;
  language: GroupLanguage;
  assignment_mode: AssignmentMode;
  max_per_juz: number;
  allow_juz_switch: boolean;
  reminder_windows: number[]; // days_before values
};

export type StalledAssignment = {
  juz_number: number;
  participant_name: string;
  participant_id: string;
  days_stalled: number;
  assignment_id: string;
};

export type AdminSummaryData = {
  completed_count: number;
  total_assigned: number;
  stalled_assignments: StalledAssignment[];
};
