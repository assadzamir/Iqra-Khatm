-- Group Khatm Schema Migration
-- Supabase Postgres (compatible with PostgreSQL 15+)

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE occasion_type AS ENUM ('GENERAL', 'MEMORIAL', 'RAMADAN', 'EID', 'SHIFA', 'CUSTOM');
CREATE TYPE group_language AS ENUM ('AR', 'EN', 'UR', 'TR', 'FR', 'ID', 'MS');
CREATE TYPE assignment_mode AS ENUM ('ADMIN', 'PARTICIPANT');
CREATE TYPE group_status AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');
CREATE TYPE participant_role AS ENUM ('ADMIN', 'CO_ADMIN', 'PARTICIPANT');
CREATE TYPE participant_status AS ENUM ('INVITED', 'JOINED', 'REMOVED', 'LEFT');
CREATE TYPE juz_status AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE progress_source AS ENUM ('IN_APP', 'AUTO_TRACKING', 'ADMIN_OVERRIDE');

-- ============================================================
-- TABLES (FK dependency order)
-- ============================================================

CREATE TABLE khatm_groups (
  id                        uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title                     varchar(80)   NOT NULL,
  intention                 text,
  occasion_type             occasion_type NOT NULL DEFAULT 'GENERAL',
  dedicated_to_name         varchar(200),
  dedicated_to_relationship varchar(100),
  start_date                date          NOT NULL,
  end_date                  date          NOT NULL,
  timezone                  varchar(64)   NOT NULL DEFAULT 'UTC',
  language                  group_language NOT NULL DEFAULT 'EN',
  assignment_mode           assignment_mode NOT NULL DEFAULT 'ADMIN',
  max_per_juz               smallint      NOT NULL DEFAULT 1 CHECK (max_per_juz >= 1),
  allow_juz_switch          boolean       NOT NULL DEFAULT true,
  invite_code               varchar(8)    NOT NULL UNIQUE,
  status                    group_status  NOT NULL DEFAULT 'ACTIVE',
  admin_user_id             uuid          NOT NULL REFERENCES auth.users(id),
  khatm_cycle               smallint      NOT NULL DEFAULT 1,
  created_at                timestamptz   NOT NULL DEFAULT now(),
  completed_at              timestamptz
);

CREATE TABLE khatm_participants (
  id             uuid                NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id       uuid                NOT NULL REFERENCES khatm_groups(id) ON DELETE CASCADE,
  user_id        uuid                         REFERENCES auth.users(id) ON DELETE SET NULL,
  name           varchar(100)        NOT NULL,
  contact_type   varchar(20)         NOT NULL DEFAULT 'PHONE',
  contact_value  varchar(255)        NOT NULL,
  role           participant_role    NOT NULL DEFAULT 'PARTICIPANT',
  status         participant_status  NOT NULL DEFAULT 'INVITED',
  joined_at      timestamptz,
  last_active_at timestamptz,
  UNIQUE (group_id, contact_value)
);

CREATE TABLE khatm_juz_assignments (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id       uuid        NOT NULL REFERENCES khatm_groups(id) ON DELETE CASCADE,
  participant_id uuid        NOT NULL REFERENCES khatm_participants(id) ON DELETE CASCADE,
  juz_number     smallint    NOT NULL CHECK (juz_number BETWEEN 1 AND 30),
  status         juz_status  NOT NULL DEFAULT 'ASSIGNED',
  progress_percent smallint  NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  last_note      varchar(100),
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,       -- SET BY TRIGGER when progress_percent first > 0
  completed_at   timestamptz,       -- SET BY TRIGGER when progress_percent = 100
  last_updated_at timestamptz NOT NULL DEFAULT now(), -- SET BY TRIGGER on every update
  assigned_by    uuid                REFERENCES khatm_participants(id),
  UNIQUE (group_id, participant_id, juz_number)
);

CREATE TABLE khatm_progress_updates (
  id               uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id    uuid            NOT NULL REFERENCES khatm_juz_assignments(id) ON DELETE CASCADE,
  participant_id   uuid            NOT NULL REFERENCES khatm_participants(id),
  progress_percent smallint        NOT NULL,
  previous_percent smallint        NOT NULL DEFAULT 0,
  note             varchar(100),
  source           progress_source NOT NULL DEFAULT 'IN_APP',
  created_at       timestamptz     NOT NULL DEFAULT now()
  -- Immutable ledger: no UPDATE or DELETE policies
);

CREATE TABLE khatm_reminder_schedules (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id    uuid        NOT NULL REFERENCES khatm_groups(id) ON DELETE CASCADE,
  days_before smallint    NOT NULL CHECK (days_before >= 0),
  label       varchar(50),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE khatm_audit_log (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id             uuid        NOT NULL REFERENCES khatm_groups(id) ON DELETE CASCADE,
  actor_participant_id uuid                 REFERENCES khatm_participants(id) ON DELETE SET NULL,
  action_type          varchar(50) NOT NULL,
  target_entity_type   varchar(50),
  target_entity_id     uuid,
  old_value            jsonb,
  new_value            jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
  -- Immutable audit log: no UPDATE or DELETE policies
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_khatm_participants_user_id     ON khatm_participants(user_id);
CREATE INDEX idx_khatm_participants_group_status ON khatm_participants(group_id, status);
CREATE INDEX idx_khatm_juz_assignments_group     ON khatm_juz_assignments(group_id);
CREATE INDEX idx_khatm_progress_updates_assignment ON khatm_progress_updates(assignment_id);
CREATE INDEX idx_khatm_groups_invite_code        ON khatm_groups(invite_code);

-- ============================================================
-- TRIGGER: update_juz_last_updated
-- Updates last_updated_at, started_at, status, and completed_at
-- based on progress_percent changes.
-- ============================================================

CREATE OR REPLACE FUNCTION update_juz_last_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Always update last_updated_at
  NEW.last_updated_at = now();

  -- Set started_at on first progress > 0
  IF OLD.progress_percent = 0 AND NEW.progress_percent > 0 THEN
    NEW.started_at = now();
    NEW.status = 'IN_PROGRESS';
  END IF;

  -- Keep status IN_PROGRESS while between 1 and 99
  IF NEW.progress_percent > 0 AND NEW.progress_percent < 100 THEN
    NEW.status = 'IN_PROGRESS';
  END IF;

  -- Mark COMPLETED at 100%
  IF NEW.progress_percent = 100 THEN
    NEW.status = 'COMPLETED';
    NEW.completed_at = now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_juz_last_updated
  BEFORE UPDATE ON khatm_juz_assignments
  FOR EACH ROW EXECUTE FUNCTION update_juz_last_updated();

-- ============================================================
-- TRIGGER: check_group_completion
-- Marks the parent khatm_groups row as COMPLETED when all
-- 30 distinct juz_numbers reach COMPLETED status.
-- ============================================================

CREATE OR REPLACE FUNCTION check_group_completion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  completed_juz_count integer;
BEGIN
  SELECT COUNT(DISTINCT juz_number)
    INTO completed_juz_count
    FROM khatm_juz_assignments
   WHERE group_id = NEW.group_id
     AND status = 'COMPLETED';

  IF completed_juz_count = 30 THEN
    UPDATE khatm_groups
       SET status = 'COMPLETED',
           completed_at = now()
     WHERE id = NEW.group_id
       AND status = 'ACTIVE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_group_completion
  AFTER UPDATE ON khatm_juz_assignments
  FOR EACH ROW EXECUTE FUNCTION check_group_completion();

-- ============================================================
-- RPC: generate_invite_code
-- Generates a unique 8-character invite code using a
-- charset that avoids visually ambiguous characters
-- (no O, 0, I, 1). Retries up to 10 times.
-- SECURITY DEFINER to bypass RLS during code generation.
-- ============================================================

CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS varchar(8) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  charset  text    := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code     text    := '';
  attempts integer := 0;
  i        integer;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(charset, floor(random() * length(charset))::integer + 1, 1);
    END LOOP;

    -- Check uniqueness
    IF NOT EXISTS (SELECT 1 FROM khatm_groups WHERE invite_code = code) THEN
      RETURN code;
    END IF;

    attempts := attempts + 1;
    IF attempts >= 10 THEN
      RAISE EXCEPTION 'Could not generate unique invite code after 10 attempts';
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- RLS HELPER FUNCTIONS (all SECURITY DEFINER to prevent
-- recursive policy evaluation)
-- ============================================================

-- Returns the participant ID for the current user in a group,
-- or NULL if they are not a JOINED member.
CREATE OR REPLACE FUNCTION my_participant(p_group_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id
    FROM khatm_participants
   WHERE group_id = p_group_id
     AND user_id  = auth.uid()
     AND status   = 'JOINED'
   LIMIT 1;
$$;

-- Returns true if the current user is ADMIN or CO_ADMIN in the group.
CREATE OR REPLACE FUNCTION is_admin_or_coadmin(p_group_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM khatm_participants
     WHERE group_id = p_group_id
       AND user_id  = auth.uid()
       AND role     IN ('ADMIN', 'CO_ADMIN')
       AND status   = 'JOINED'
  );
$$;

-- Returns true if the current user is the ADMIN of the group.
CREATE OR REPLACE FUNCTION is_admin(p_group_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM khatm_participants
     WHERE group_id = p_group_id
       AND user_id  = auth.uid()
       AND role     = 'ADMIN'
       AND status   = 'JOINED'
  );
$$;

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE khatm_groups             ENABLE ROW LEVEL SECURITY;
ALTER TABLE khatm_participants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE khatm_juz_assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE khatm_progress_updates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE khatm_reminder_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE khatm_audit_log          ENABLE ROW LEVEL SECURITY;

-- khatm_groups
CREATE POLICY khatm_groups_select ON khatm_groups
  FOR SELECT USING (my_participant(id) IS NOT NULL);

CREATE POLICY khatm_groups_insert ON khatm_groups
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY khatm_groups_update ON khatm_groups
  FOR UPDATE USING (is_admin(id));

-- khatm_participants
CREATE POLICY khatm_participants_select ON khatm_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM khatm_participants kp2
       WHERE kp2.group_id = khatm_participants.group_id
         AND kp2.user_id  = auth.uid()
         AND kp2.status   = 'JOINED'
    )
  );

CREATE POLICY khatm_participants_insert ON khatm_participants
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Admin/co-admin can update any field (promote, demote, remove)
CREATE POLICY khatm_participants_update_admin ON khatm_participants
  FOR UPDATE USING (is_admin_or_coadmin(group_id));

-- Participant can update their own row (last_active_at, etc.)
-- but cannot escalate their own role
CREATE POLICY khatm_participants_update_self ON khatm_participants
  FOR UPDATE USING (user_id = auth.uid());

-- khatm_juz_assignments
CREATE POLICY khatm_juz_assignments_select ON khatm_juz_assignments
  FOR SELECT USING (my_participant(group_id) IS NOT NULL);

CREATE POLICY khatm_juz_assignments_insert ON khatm_juz_assignments
  FOR INSERT WITH CHECK (is_admin_or_coadmin(group_id));

CREATE POLICY khatm_juz_assignments_update ON khatm_juz_assignments
  FOR UPDATE USING (is_admin_or_coadmin(group_id));

-- khatm_progress_updates (immutable — no UPDATE or DELETE)
CREATE POLICY khatm_progress_updates_select ON khatm_progress_updates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM khatm_juz_assignments kja
        JOIN khatm_participants kp ON kp.id = kja.participant_id
       WHERE kja.id      = khatm_progress_updates.assignment_id
         AND kp.user_id  = auth.uid()
         AND kp.status   = 'JOINED'
    )
  );

CREATE POLICY khatm_progress_updates_insert ON khatm_progress_updates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM khatm_juz_assignments kja
        JOIN khatm_participants kp ON kp.id = kja.participant_id
       WHERE kja.id      = assignment_id
         AND kp.user_id  = auth.uid()
         AND kp.status   = 'JOINED'
    )
  );

-- khatm_reminder_schedules
CREATE POLICY khatm_reminder_schedules_select ON khatm_reminder_schedules
  FOR SELECT USING (my_participant(group_id) IS NOT NULL);

CREATE POLICY khatm_reminder_schedules_insert ON khatm_reminder_schedules
  FOR INSERT WITH CHECK (is_admin_or_coadmin(group_id));

CREATE POLICY khatm_reminder_schedules_update ON khatm_reminder_schedules
  FOR UPDATE USING (is_admin_or_coadmin(group_id));

-- khatm_audit_log (server-side only — no client INSERT/UPDATE/DELETE)
CREATE POLICY khatm_audit_log_select ON khatm_audit_log
  FOR SELECT USING (my_participant(group_id) IS NOT NULL);
