-- ============================================================
-- Migration 003: Acceptance Condition Fixes
-- Addresses 2 acceptance conditions from UAT:
--   Condition 1: khatm_audit_log INSERT RLS policy missing
--   Condition 2: WITH CHECK (role = OLD.role) invalid in Postgres RLS
-- ============================================================

-- ============================================================
-- Condition 1: khatm_audit_log INSERT policy
--
-- Previously, khatm_audit_log had no INSERT policy, so all
-- client-side audit writes (useAssignJuz, useAssignRole,
-- useJoinKhatm, useUpdateGroupSettings) were silently rejected
-- by RLS, resulting in zero audit trail.
--
-- This policy allows any JOINED participant to insert audit log
-- entries for groups they belong to. my_participant() returns
-- NULL for non-members, preventing cross-group injection.
--
-- Note: claim_juz and start_new_cycle RPCs are SECURITY DEFINER
-- and bypass RLS entirely — they should add their own audit log
-- inserts directly (see SA-016, tracked separately).
-- ============================================================

CREATE POLICY khatm_audit_log_insert ON khatm_audit_log
  FOR INSERT
  WITH CHECK (my_participant(group_id) IS NOT NULL);


-- ============================================================
-- Condition 2: Self-role-escalation prevention via trigger
--
-- The original khatm_participants_update_self policy used:
--   WITH CHECK (role = OLD.role)
-- PostgreSQL does not expose OLD in RLS WITH CHECK clauses for
-- UPDATE policies. This clause was silently ignored, meaning
-- participants could promote themselves to ADMIN.
--
-- Fix: Remove the invalid WITH CHECK from the self-update
-- policy, then enforce role immutability via a BEFORE UPDATE
-- trigger that fires only when the role column actually changes.
--
-- The trigger uses is_admin_or_coadmin() to distinguish between:
--   - Admin/co-admin updating the role (permitted)
--   - Participant updating their own row (role change blocked)
-- ============================================================

-- Step 1: Replace the policy — keep USING, drop invalid WITH CHECK.
DROP POLICY khatm_participants_update_self ON khatm_participants;

CREATE POLICY khatm_participants_update_self ON khatm_participants
  FOR UPDATE
  USING (user_id = auth.uid());

-- Step 2: Trigger function — blocks role changes by non-admins.
-- The WHEN clause on the trigger ensures this function only runs
-- when role actually changes, avoiding overhead on every update.
CREATE OR REPLACE FUNCTION prevent_self_role_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- If the caller is not an admin or co-admin of this group,
  -- block any attempt to change the role column.
  IF NOT is_admin_or_coadmin(OLD.group_id) THEN
    RAISE EXCEPTION 'Participants may not change their own role'
      USING ERRCODE = 'P0403';
  END IF;
  RETURN NEW;
END;
$$;

-- Step 3: Attach trigger — only fires when role IS DISTINCT FROM OLD.role.
CREATE TRIGGER trg_prevent_self_role_change
  BEFORE UPDATE ON khatm_participants
  FOR EACH ROW
  WHEN (NEW.role IS DISTINCT FROM OLD.role)
  EXECUTE FUNCTION prevent_self_role_change();
