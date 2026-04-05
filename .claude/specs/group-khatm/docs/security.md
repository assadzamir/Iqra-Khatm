# Group Khatm — Security Reference

> Database schema details and RLS policy SQL are in [database.md](./database.md).

---

## Security Posture Summary

| Metric | Value |
|--------|-------|
| Score | **78 / 100** |
| Trend | +9 from previous audit (69) |
| Critical findings | 0 |
| High findings | 0 |
| Medium findings | 11 |
| Low findings | 3 |
| Info findings | 0 |
| Last audit date | 2026-04-05 |

The feature reached this posture after resolving 3 HIGH findings (SA-002, SA-003, SA-007) in migration 002. Two additional MEDIUM findings (SA-015, SA-016) were identified during that same audit pass. There are currently no critical or high severity open findings.

---

## What Was Fixed in This Implementation

### SA-002 — IDOR in participant progress updates (HIGH → Resolved)

**Migration 002, lines 20–23.**

The original schema had only an admin/co-admin UPDATE policy on `khatm_juz_assignments`. Participants could not update progress on their own assignments at all, but more critically, had the policy been broader it would have allowed cross-user assignment re-attribution via a client-supplied `participant_id`.

**Fix:** Added `khatm_juz_assignments_update_self` policy:
```sql
FOR UPDATE
USING  (participant_id = my_participant(group_id))
WITH CHECK (participant_id = my_participant(group_id))
```

The `my_participant()` SECURITY DEFINER function derives the caller's participant ID server-side. A participant can only update rows where they are the assignee, and the WITH CHECK clause prevents re-attribution.

---

### SA-003 — IDOR in Juz self-claim (HIGH → Resolved)

**Migration 002, lines 38–117.**

The `useAssignJuz` mutation accepted a client-supplied `participant_id`. In PARTICIPANT mode, any authenticated user could supply any `participant_id` and claim Juz on behalf of another participant.

**Fix:** The `claim_juz(p_group_id, p_juz_number)` SECURITY DEFINER RPC derives `participant_id` from `auth.uid()` server-side. Preconditions enforced server-side: caller is JOINED, group is ACTIVE and in PARTICIPANT mode, juz number is valid (1–30), availability is below `max_per_juz`. The client (`useClaimJuz`) now passes only `group_id` and `juz_number`.

---

### SA-007 — New cycle creation without server-side admin check (HIGH → Resolved)

**Migration 002, lines 135–234.**

The original `useStartNewCycle` mutation performed a direct insert of a new group, with `admin_user_id` copied from the source group. Any group member could start a new cycle, and a malicious client could set `admin_user_id` to any user's UUID.

**Fix:** The `start_new_cycle(p_source_group_id)` SECURITY DEFINER RPC enforces:
1. Caller must be the group ADMIN (`is_admin()` check)
2. Source group must have `status = 'COMPLETED'`
3. New group's `admin_user_id` is always `auth.uid()` — never copied from source
4. All steps (group insert + participant copy) run atomically in one transaction

---

## Open Findings

| ID | Severity | Category | Title | Status |
|----|----------|----------|-------|--------|
| SA-001 | MEDIUM | A02-Cryptographic Failures | Non-CSPRNG invite code generation (`random()` in `generate_invite_code`) | Open |
| SA-004 | MEDIUM | A01-Broken Access Control | `khatm_participants` INSERT policy does not validate invite code server-side | Open |
| SA-005 | MEDIUM | A01-Broken Access Control | `khatm_groups` INSERT policy missing `WITH CHECK (admin_user_id = auth.uid())` | Open |
| SA-006 | MEDIUM | A01-Broken Access Control | Self-role-escalation trigger (SA-006 was the RLS WITH CHECK bug) | Fixed in 003 |
| SA-008 | MEDIUM | A09-Logging/Info Disclosure | Edge Function leaks internal error details in HTTP response body | Open |
| SA-009 | LOW | STRIDE-Repudiation | `useAutoTracking` pending queue was in-memory only | Fixed in implementation |
| SA-010 | MEDIUM | STRIDE-Spoofing | `notification-scheduler` Edge Function has no authentication header | Open |
| SA-011 | LOW | A01-Broken Access Control | Admin UPDATE policy allows changing immutable fields (`group_id`, `participant_id`, `juz_number`) | Open |
| SA-012 | MEDIUM | STRIDE-Repudiation | No INSERT policy on `khatm_audit_log` — client audit writes silently rejected | Fixed in 003 |
| SA-013 | MEDIUM | A04-Insecure Design | `useCreateKhatm` is non-transactional — orphaned rows on partial failure | Open |
| SA-014 | LOW | A01-Broken Access Control | `khatm_progress_updates` INSERT policy blocks admin override writes | Open |
| SA-015 | MEDIUM | A04-Insecure Design / Race Condition | TOCTOU in `claim_juz` — concurrent claims can exceed `max_per_juz` | Open (new) |
| SA-016 | MEDIUM | STRIDE-Repudiation | `claim_juz` and `start_new_cycle` RPCs do not write audit log entries | Open (new) |
| SA-017 | MEDIUM | STRIDE-Repudiation | `handleArchiveGroup` bypasses mutation layer — no audit log entry | Open |

---

## RLS Architecture

### Design Principle

All six `khatm_*` tables have RLS enabled. Access is mediated through three SECURITY DEFINER helper functions (`my_participant`, `is_admin_or_coadmin`, `is_admin`). These functions are `SECURITY DEFINER` specifically to prevent recursive RLS evaluation: a non-SECURITY DEFINER function called from an RLS policy on `khatm_juz_assignments` would itself trigger the `khatm_participants` SELECT policy, which would call the same function again — infinite recursion.

### Policy Summary by Table

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `khatm_groups` | JOINED member | any auth user | ADMIN only | — |
| `khatm_participants` | JOINED member (same group) | any auth user | admin/co-admin (any field) OR self (role blocked by trigger) | — |
| `khatm_juz_assignments` | JOINED member | admin/co-admin (direct); claim_juz RPC bypasses via SECURITY DEFINER | admin/co-admin OR own row | — |
| `khatm_progress_updates` | JOINED member | JOINED member (own assignment only — SA-014) | none | none |
| `khatm_reminder_schedules` | JOINED member | admin/co-admin | admin/co-admin | — |
| `khatm_audit_log` | JOINED member | JOINED member (added migration 003) | none | none |

### SECURITY DEFINER RLS Helpers

| Function | Signature | Bypasses RLS? | Used in policies for |
|----------|-----------|---------------|----------------------|
| `my_participant(p_group_id)` | → `uuid \| NULL` | Yes | `khatm_groups` SELECT, `khatm_juz_assignments` SELECT+UPDATE, `khatm_reminder_schedules` SELECT, `khatm_audit_log` SELECT+INSERT |
| `is_admin_or_coadmin(p_group_id)` | → `boolean` | Yes | `khatm_participants` admin UPDATE, `khatm_juz_assignments` INSERT+admin UPDATE, `khatm_reminder_schedules` INSERT+UPDATE, and `prevent_self_role_change` trigger |
| `is_admin(p_group_id)` | → `boolean` | Yes | `khatm_groups` UPDATE, `start_new_cycle` RPC |

### SECURITY DEFINER RPCs

| Function | Why SECURITY DEFINER |
|----------|---------------------|
| `generate_invite_code()` | Needs to query `khatm_groups.invite_code` for uniqueness check; caller may not have SELECT access before the group row exists |
| `claim_juz(p_group_id, p_juz_number)` | Bypasses the admin-only INSERT policy on `khatm_juz_assignments` to allow PARTICIPANT-mode self-claim |
| `start_new_cycle(p_source_group_id)` | Needs to INSERT a new `khatm_groups` row (only auth'd users normally allowed) and copy participants across groups |

---

## Audit Trail Status

### SA-012: INSERT Policy Added (Fixed in Migration 003)

Before migration 003, `khatm_audit_log` had only a SELECT policy. All client-side audit writes from `useAssignJuz`, `useAssignRole`, `useJoinKhatm`, and `useUpdateGroupSettings` were silently rejected by RLS. There was effectively no audit trail for any user-initiated action.

Migration 003 adds:
```sql
CREATE POLICY khatm_audit_log_insert ON khatm_audit_log
  FOR INSERT
  WITH CHECK (my_participant(group_id) IS NOT NULL);
```

Any JOINED participant may now insert audit entries for their group. `my_participant()` returning NULL for non-members prevents cross-group injection.

### SA-016: RPCs Missing Audit Entries (Tracked / Not Yet Fixed)

`claim_juz` and `start_new_cycle` are SECURITY DEFINER and bypass RLS entirely, so they could insert audit entries even without the client INSERT policy. Neither currently does. Juz self-claims and new cycle starts have no audit record.

**Recommended fix for `claim_juz`:**
```sql
INSERT INTO khatm_audit_log(group_id, actor_participant_id, action_type, new_value)
VALUES (p_group_id, v_participant_id, 'JUZ_CLAIMED',
        jsonb_build_object('juz_number', p_juz_number));
```

**Recommended fix for `start_new_cycle`:**
```sql
INSERT INTO khatm_audit_log(group_id, actor_participant_id, action_type, new_value)
VALUES (v_new_group.id, my_participant(v_new_group.id), 'NEW_CYCLE_STARTED',
        jsonb_build_object('source_group_id', p_source_group_id,
                           'khatm_cycle', v_new_group.khatm_cycle));
```

---

## Role Escalation Prevention

### SA-006 Fix (Migration 003)

The original `khatm_participants_update_self` policy used `WITH CHECK (role = OLD.role)`. PostgreSQL does not expose `OLD` in RLS `WITH CHECK` clauses for UPDATE policies. This clause was silently ignored, meaning any participant could modify their own `role` column to `'ADMIN'` via a direct update.

**Fix in migration 003:**
1. Drop the broken policy
2. Replace with a policy that keeps only `USING (user_id = auth.uid())` — no WITH CHECK
3. Add `trg_prevent_self_role_change` BEFORE UPDATE trigger:
   - Fires only `WHEN (NEW.role IS DISTINCT FROM OLD.role)` — zero overhead on non-role updates
   - Checks `is_admin_or_coadmin(OLD.group_id)` — if the caller is not admin/co-admin, raises `P0403`

This means role changes on `khatm_participants` are now only possible by:
- An admin or co-admin operating via the `khatm_participants_update_admin` policy, OR
- A SECURITY DEFINER function (like `start_new_cycle`) that bypasses RLS entirely

---

## Recommendations for Next Iteration

| Finding | Recommendation |
|---------|---------------|
| SA-001 | Replace `random()` in `generate_invite_code()` with `get_byte(gen_random_bytes(1), 0)` for CSPRNG-based sampling |
| SA-004 | Add a `join_group(invite_code text, name text)` SECURITY DEFINER RPC that validates the invite code server-side; remove or tighten the permissive `khatm_participants` INSERT policy |
| SA-005 | Add `WITH CHECK (admin_user_id = auth.uid())` to the `khatm_groups_insert` policy, or move group creation to a `create_khatm(input jsonb)` SECURITY DEFINER RPC (which also fixes SA-013) |
| SA-010 | Add `Authorization: Bearer <shared-secret>` verification to the Edge Function entry point; store the secret in Supabase Vault and inject it into the cron job configuration |
| SA-013 | Wrap group creation in a `create_khatm(input jsonb)` SECURITY DEFINER RPC — single transaction, also fixes SA-005 |
| SA-015 | Add `PERFORM pg_advisory_xact_lock(hashtext(p_group_id::text || p_juz_number::text))` before the COUNT check in `claim_juz`, or add a partial unique index enforcing the cap for the `max_per_juz = 1` case |
| SA-016 | Add audit log inserts to `claim_juz` and `start_new_cycle` as shown in the Audit Trail section above |
