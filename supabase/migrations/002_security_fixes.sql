-- ============================================================
-- Migration 002: Security Fixes
-- Addresses SA-002, SA-003, SA-007 from security audit.
-- ============================================================

-- ============================================================
-- SA-002: Self-update RLS policy for khatm_juz_assignments
--
-- The existing UPDATE policy only allows admin/co-admin, which
-- means participants cannot update progress on their own
-- assignments. This policy adds a second permitted path: the
-- assignment owner may update their own row.
--
-- USING  — restricts which rows can be targeted: only rows where
--           the caller is the assigned participant.
-- WITH CHECK — prevents re-attributing the assignment to a
--              different participant_id after the update.
-- ============================================================

CREATE POLICY khatm_juz_assignments_update_self ON khatm_juz_assignments
  FOR UPDATE
  USING  (participant_id = my_participant(group_id))
  WITH CHECK (participant_id = my_participant(group_id));


-- ============================================================
-- SA-003: claim_juz RPC
--
-- Secure self-claim for PARTICIPANT assignment_mode groups.
-- The client supplies only (group_id, juz_number); participant_id
-- is derived server-side from auth.uid() and cannot be spoofed.
--
-- SECURITY DEFINER is required to bypass the admin-only INSERT
-- policy on khatm_juz_assignments so participants can claim a
-- juz when the group's assignment_mode permits it.
-- ============================================================

CREATE OR REPLACE FUNCTION claim_juz(p_group_id uuid, p_juz_number int)
RETURNS khatm_juz_assignments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_participant_id  uuid;
  v_assignment_mode assignment_mode;
  v_max_per_juz     smallint;
  v_existing_count  integer;
  v_result          khatm_juz_assignments;
BEGIN
  -- 1. Verify caller is a JOINED participant in this group.
  SELECT id INTO v_participant_id
    FROM khatm_participants
   WHERE group_id = p_group_id
     AND user_id  = auth.uid()
     AND status   = 'JOINED'
   LIMIT 1;

  IF v_participant_id IS NULL THEN
    RAISE EXCEPTION 'Not a joined member of this group'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Verify group is ACTIVE and in PARTICIPANT assignment_mode.
  SELECT assignment_mode, max_per_juz
    INTO v_assignment_mode, v_max_per_juz
    FROM khatm_groups
   WHERE id     = p_group_id
     AND status = 'ACTIVE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found or not active'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_assignment_mode <> 'PARTICIPANT' THEN
    RAISE EXCEPTION 'Group does not allow self-assignment'
      USING ERRCODE = 'P0003';
  END IF;

  -- 3. Validate juz number range.
  IF p_juz_number < 1 OR p_juz_number > 30 THEN
    RAISE EXCEPTION 'Invalid juz number: must be between 1 and 30'
      USING ERRCODE = 'P0004';
  END IF;

  -- 4. Check availability: count existing assignments for this juz.
  SELECT COUNT(*) INTO v_existing_count
    FROM khatm_juz_assignments
   WHERE group_id   = p_group_id
     AND juz_number = p_juz_number;

  IF v_existing_count >= v_max_per_juz THEN
    RAISE EXCEPTION 'This Juz is already fully assigned'
      USING ERRCODE = '23505';
  END IF;

  -- 5. Insert; participant_id is always the caller's own ID.
  INSERT INTO khatm_juz_assignments (
    group_id,
    participant_id,
    juz_number,
    assigned_by,
    status,
    progress_percent
  ) VALUES (
    p_group_id,
    v_participant_id,
    p_juz_number,
    v_participant_id,
    'ASSIGNED',
    0
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;


-- ============================================================
-- SA-007: start_new_cycle RPC
--
-- Atomically clones a COMPLETED khatm group into cycle N+1.
-- Server-side enforcements:
--   (1) Caller must be the group ADMIN (not just any member).
--   (2) Source group must have status = 'COMPLETED'.
--   (3) admin_user_id on the new group is set to auth.uid(),
--       never copied from source — prevents admin spoofing via
--       the overly permissive khatm_groups INSERT policy.
--
-- All steps (create group + copy participants) run in the same
-- transaction, so there are no orphaned rows on partial failure.
-- ============================================================

CREATE OR REPLACE FUNCTION start_new_cycle(p_source_group_id uuid)
RETURNS khatm_groups
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source    khatm_groups;
  v_new_code  varchar(8);
  v_new_group khatm_groups;
BEGIN
  -- 1. Verify caller is the ADMIN of the source group.
  IF NOT is_admin(p_source_group_id) THEN
    RAISE EXCEPTION 'Only the group admin can start a new cycle'
      USING ERRCODE = 'P0401';
  END IF;

  -- 2. Fetch source group and verify it is COMPLETED.
  SELECT * INTO v_source
    FROM khatm_groups
   WHERE id = p_source_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source group not found'
      USING ERRCODE = 'P0404';
  END IF;

  IF v_source.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Group must be COMPLETED before starting a new cycle'
      USING ERRCODE = 'P0003';
  END IF;

  -- 3. Generate a new unique invite code.
  v_new_code := generate_invite_code();

  -- 4. Insert new group. admin_user_id = auth.uid() always.
  INSERT INTO khatm_groups (
    title,
    intention,
    occasion_type,
    dedicated_to_name,
    dedicated_to_relationship,
    start_date,
    end_date,
    timezone,
    language,
    assignment_mode,
    max_per_juz,
    allow_juz_switch,
    invite_code,
    status,
    admin_user_id,
    khatm_cycle
  )
  VALUES (
    v_source.title,
    v_source.intention,
    v_source.occasion_type,
    v_source.dedicated_to_name,
    v_source.dedicated_to_relationship,
    v_source.start_date,
    v_source.end_date,
    v_source.timezone,
    v_source.language,
    v_source.assignment_mode,
    v_source.max_per_juz,
    v_source.allow_juz_switch,
    v_new_code,
    'ACTIVE',
    auth.uid(),
    v_source.khatm_cycle + 1
  )
  RETURNING * INTO v_new_group;

  -- 5. Copy all JOINED participants, preserving their roles.
  INSERT INTO khatm_participants (
    group_id,
    user_id,
    name,
    contact_type,
    contact_value,
    role,
    status,
    joined_at
  )
  SELECT
    v_new_group.id,
    user_id,
    name,
    contact_type,
    contact_value,
    role,
    'JOINED',
    now()
  FROM khatm_participants
  WHERE group_id = p_source_group_id
    AND status   = 'JOINED';

  RETURN v_new_group;
END;
$$;
