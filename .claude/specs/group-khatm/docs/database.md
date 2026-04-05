# Group Khatm — Database Reference

> Security policies are summarized here. For open findings and threat assessment, see [security.md](./security.md).

---

## Schema Overview

| Table | Purpose | Expected Row Count |
|-------|---------|-------------------|
| `khatm_groups` | One row per Khatm group (active, completed, or archived) | Low (tens per user) |
| `khatm_participants` | Members of each group, including non-app users | ~2–100 per group |
| `khatm_juz_assignments` | Assignment of each Juz to a participant; max `max_per_juz` rows per Juz | 0–60 per group |
| `khatm_progress_updates` | Immutable ledger of every progress write | High (many per reading session) |
| `khatm_reminder_schedules` | Days-before-deadline windows for each group | 1–10 per group |
| `khatm_audit_log` | Immutable record of admin and system actions | Medium (one per action) |

---

## Tables

### `khatm_groups`

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | `uuid` | PK, `DEFAULT uuid_generate_v4()` |
| `title` | `varchar(80)` | NOT NULL |
| `intention` | `text` | nullable |
| `occasion_type` | `occasion_type` | NOT NULL, DEFAULT `'GENERAL'` |
| `dedicated_to_name` | `varchar(200)` | nullable |
| `dedicated_to_relationship` | `varchar(100)` | nullable |
| `start_date` | `date` | NOT NULL |
| `end_date` | `date` | NOT NULL |
| `timezone` | `varchar(64)` | NOT NULL, DEFAULT `'UTC'` |
| `language` | `group_language` | NOT NULL, DEFAULT `'EN'` |
| `assignment_mode` | `assignment_mode` | NOT NULL, DEFAULT `'ADMIN'` |
| `max_per_juz` | `smallint` | NOT NULL, DEFAULT `1`, CHECK `>= 1` |
| `allow_juz_switch` | `boolean` | NOT NULL, DEFAULT `true` |
| `invite_code` | `varchar(8)` | NOT NULL, UNIQUE |
| `status` | `group_status` | NOT NULL, DEFAULT `'ACTIVE'` |
| `admin_user_id` | `uuid` | NOT NULL, FK `auth.users(id)` |
| `khatm_cycle` | `smallint` | NOT NULL, DEFAULT `1` |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` |
| `completed_at` | `timestamptz` | nullable — set by `check_group_completion` trigger |

**Indexes:** `idx_khatm_groups_invite_code` on `(invite_code)`

**RLS policies:**
- `SELECT` — `my_participant(id) IS NOT NULL` (only joined members see the group)
- `INSERT` — `auth.uid() IS NOT NULL` (any authenticated user; see SA-005 in security.md)
- `UPDATE` — `is_admin(id)` (group ADMIN only)

---

### `khatm_participants`

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | `uuid` | PK, `DEFAULT uuid_generate_v4()` |
| `group_id` | `uuid` | NOT NULL, FK `khatm_groups(id) ON DELETE CASCADE` |
| `user_id` | `uuid` | nullable, FK `auth.users(id) ON DELETE SET NULL` |
| `name` | `varchar(100)` | NOT NULL |
| `contact_type` | `varchar(20)` | NOT NULL, DEFAULT `'PHONE'` |
| `contact_value` | `varchar(255)` | NOT NULL |
| `role` | `participant_role` | NOT NULL, DEFAULT `'PARTICIPANT'` |
| `status` | `participant_status` | NOT NULL, DEFAULT `'INVITED'` |
| `joined_at` | `timestamptz` | nullable |
| `last_active_at` | `timestamptz` | nullable |

**Constraints:** `UNIQUE (group_id, contact_value)`

**Indexes:**
- `idx_khatm_participants_user_id` on `(user_id)`
- `idx_khatm_participants_group_status` on `(group_id, status)`

**RLS policies:**
- `SELECT` — EXISTS check: caller has a JOINED row in the same group (self-join on `khatm_participants`)
- `INSERT` — `auth.uid() IS NOT NULL` (any authenticated user; see SA-004 in security.md)
- `UPDATE` (admin) — `is_admin_or_coadmin(group_id)` — any field updatable
- `UPDATE` (self) — `user_id = auth.uid()` — own row only; role changes blocked by trigger (see migration 003)

---

### `khatm_juz_assignments`

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | `uuid` | PK, `DEFAULT uuid_generate_v4()` |
| `group_id` | `uuid` | NOT NULL, FK `khatm_groups(id) ON DELETE CASCADE` |
| `participant_id` | `uuid` | NOT NULL, FK `khatm_participants(id) ON DELETE CASCADE` |
| `juz_number` | `smallint` | NOT NULL, CHECK `BETWEEN 1 AND 30` |
| `status` | `juz_status` | NOT NULL, DEFAULT `'ASSIGNED'` — managed by trigger |
| `progress_percent` | `smallint` | NOT NULL, DEFAULT `0`, CHECK `BETWEEN 0 AND 100` |
| `last_note` | `varchar(100)` | nullable |
| `assigned_at` | `timestamptz` | NOT NULL, DEFAULT `now()` |
| `started_at` | `timestamptz` | nullable — set by trigger when `progress_percent` first `> 0` |
| `completed_at` | `timestamptz` | nullable — set by trigger when `progress_percent = 100` |
| `last_updated_at` | `timestamptz` | NOT NULL, DEFAULT `now()` — set by trigger on every update |
| `assigned_by` | `uuid` | nullable, FK `khatm_participants(id)` |

**Constraints:** `UNIQUE (group_id, participant_id, juz_number)`

**Indexes:** `idx_khatm_juz_assignments_group` on `(group_id)`

**RLS policies:**
- `SELECT` — `my_participant(group_id) IS NOT NULL`
- `INSERT` — `is_admin_or_coadmin(group_id)` (admin/co-admin assign; `claim_juz` RPC handles self-claim via SECURITY DEFINER bypass)
- `UPDATE` (admin) — `is_admin_or_coadmin(group_id)`
- `UPDATE` (self) — `participant_id = my_participant(group_id)` WITH CHECK same — added in migration 002

---

### `khatm_progress_updates`

Immutable ledger. No UPDATE or DELETE policies.

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | `uuid` | PK, `DEFAULT uuid_generate_v4()` |
| `assignment_id` | `uuid` | NOT NULL, FK `khatm_juz_assignments(id) ON DELETE CASCADE` |
| `participant_id` | `uuid` | NOT NULL, FK `khatm_participants(id)` |
| `progress_percent` | `smallint` | NOT NULL |
| `previous_percent` | `smallint` | NOT NULL, DEFAULT `0` |
| `note` | `varchar(100)` | nullable |
| `source` | `progress_source` | NOT NULL, DEFAULT `'IN_APP'` |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` |

**Indexes:** `idx_khatm_progress_updates_assignment` on `(assignment_id)`

**RLS policies:**
- `SELECT` — EXISTS: caller is a JOINED participant in the assignment's group (join via `khatm_juz_assignments` → `khatm_participants`)
- `INSERT` — same EXISTS check — caller's `user_id` must match a JOINED participant; note: admin override writes set `participant_id` to the target participant, which causes this check to fail (see SA-014 in security.md)

---

### `khatm_reminder_schedules`

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | `uuid` | PK, `DEFAULT uuid_generate_v4()` |
| `group_id` | `uuid` | NOT NULL, FK `khatm_groups(id) ON DELETE CASCADE` |
| `days_before` | `smallint` | NOT NULL, CHECK `>= 0` |
| `label` | `varchar(50)` | nullable |
| `is_active` | `boolean` | NOT NULL, DEFAULT `true` |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` |

**RLS policies:**
- `SELECT` — `my_participant(group_id) IS NOT NULL`
- `INSERT` — `is_admin_or_coadmin(group_id)`
- `UPDATE` — `is_admin_or_coadmin(group_id)` (used to soft-delete by setting `is_active = false`)

---

### `khatm_audit_log`

Immutable. No UPDATE or DELETE policies. The `INSERT` policy was added in migration 003.

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | `uuid` | PK, `DEFAULT uuid_generate_v4()` |
| `group_id` | `uuid` | NOT NULL, FK `khatm_groups(id) ON DELETE CASCADE` |
| `actor_participant_id` | `uuid` | nullable, FK `khatm_participants(id) ON DELETE SET NULL` |
| `action_type` | `varchar(50)` | NOT NULL |
| `target_entity_type` | `varchar(50)` | nullable |
| `target_entity_id` | `uuid` | nullable |
| `old_value` | `jsonb` | nullable |
| `new_value` | `jsonb` | nullable |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` |

**Known `action_type` values:** `JUZ_ASSIGNED`, `ROLE_ASSIGNED`, `ROLE_REVOKED`, `MEMBER_JOINED`, `GROUP_SETTINGS_UPDATED`, `INVITE_CODE_REGENERATED`, `NOTIFICATION_SENT`, `NOTIFICATION_FAILED`, `NOTIFICATION_SKIPPED`

**RLS policies:**
- `SELECT` — `my_participant(group_id) IS NOT NULL`
- `INSERT` — `my_participant(group_id) IS NOT NULL` (added in migration 003)

---

## Database Triggers

### `trg_update_juz_last_updated`

- **Fires:** BEFORE UPDATE on `khatm_juz_assignments`, FOR EACH ROW
- **Function:** `update_juz_last_updated()` (LANGUAGE plpgsql)
- **Logic:**
  - Always: `NEW.last_updated_at = now()`
  - When `OLD.progress_percent = 0 AND NEW.progress_percent > 0`: sets `NEW.started_at = now()`, `NEW.status = 'IN_PROGRESS'`
  - When `0 < NEW.progress_percent < 100`: sets `NEW.status = 'IN_PROGRESS'`
  - When `NEW.progress_percent = 100`: sets `NEW.status = 'COMPLETED'`, `NEW.completed_at = now()`

### `trg_check_group_completion`

- **Fires:** AFTER UPDATE on `khatm_juz_assignments`, FOR EACH ROW
- **Function:** `check_group_completion()` (LANGUAGE plpgsql)
- **Logic:** Counts `DISTINCT juz_number` WHERE `group_id = NEW.group_id AND status = 'COMPLETED'`. When count reaches 30, updates `khatm_groups SET status = 'COMPLETED', completed_at = now()` where `status = 'ACTIVE'`. This is what triggers the completion ceremony flow via `useKhatmRealtime`.

### `trg_prevent_self_role_change` (migration 003)

- **Fires:** BEFORE UPDATE on `khatm_participants`, FOR EACH ROW WHEN `(NEW.role IS DISTINCT FROM OLD.role)`
- **Function:** `prevent_self_role_change()` (LANGUAGE plpgsql)
- **Logic:** If `NOT is_admin_or_coadmin(OLD.group_id)`, raises exception `P0403`. Blocks any non-admin participant from changing their own role. Fires only when the `role` column actually changes, minimizing overhead.

---

## RPCs

### `generate_invite_code() RETURNS varchar(8)`

```sql
SECURITY DEFINER, LANGUAGE plpgsql
```

Generates a unique 8-character code from charset `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excludes O, 0, I, 1 to prevent visual ambiguity). Retries up to 10 times; raises exception `'Could not generate unique invite code after 10 attempts'` on the 11th. Uses `random()` — not a CSPRNG (see SA-001 in security.md). Called by `useCreateKhatm` and internally by `start_new_cycle`.

---

### `claim_juz(p_group_id uuid, p_juz_number int) RETURNS khatm_juz_assignments`

```sql
SECURITY DEFINER, LANGUAGE plpgsql
```

Added in migration 002 (SA-003 fix). Validates in order:
1. Caller is a JOINED participant in the group (derives `participant_id` from `auth.uid()` — cannot be spoofed)
2. Group is ACTIVE and `assignment_mode = 'PARTICIPANT'`
3. `p_juz_number` is between 1 and 30
4. Existing assignment count is below `max_per_juz` (note: TOCTOU race possible — see SA-015)

Inserts the assignment with `assigned_by = v_participant_id` and returns the full row. Does not write an audit log entry (see SA-016).

---

### `start_new_cycle(p_source_group_id uuid) RETURNS khatm_groups`

```sql
SECURITY DEFINER, LANGUAGE plpgsql
```

Added in migration 002 (SA-007 fix). Validates in order:
1. Caller is the ADMIN of the source group (`is_admin()`)
2. Source group `status = 'COMPLETED'`

Creates a new group with `khatm_cycle = N + 1`, `admin_user_id = auth.uid()` (never copied from source), and a new invite code. Copies all JOINED participants preserving their roles. All steps run in a single transaction. Does not write an audit log entry (see SA-016).

---

## RLS Helper Functions

All three helpers are `SECURITY DEFINER` to prevent recursive RLS policy evaluation (a non-SECURITY DEFINER function called from an RLS policy would itself be subject to RLS on `khatm_participants`, causing infinite recursion).

| Function | Signature | Returns | Description |
|----------|-----------|---------|-------------|
| `my_participant` | `(p_group_id uuid)` | `uuid \| NULL` | Participant `id` for `auth.uid()` in the group with `status = 'JOINED'`, or NULL if not a member |
| `is_admin_or_coadmin` | `(p_group_id uuid)` | `boolean` | True if caller has `role IN ('ADMIN','CO_ADMIN') AND status = 'JOINED'` |
| `is_admin` | `(p_group_id uuid)` | `boolean` | True if caller has `role = 'ADMIN' AND status = 'JOINED'` |

---

## Migration History

| Migration | File | What Changed |
|-----------|------|-------------|
| 001 | `001_khatm_schema.sql` | Initial schema: 8 enums, 6 tables, 5 indexes, 2 triggers (`update_juz_last_updated`, `check_group_completion`), `generate_invite_code` RPC, 3 RLS helper functions, 16 RLS policies |
| 002 | `002_security_fixes.sql` | SA-002 fix: self-update policy on `khatm_juz_assignments`; SA-003 fix: `claim_juz` SECURITY DEFINER RPC; SA-007 fix: `start_new_cycle` SECURITY DEFINER RPC |
| 003 | `003_acceptance_fixes.sql` | SA-012 / acceptance condition: `INSERT` policy on `khatm_audit_log`; SA-006 / acceptance condition: replaced broken `WITH CHECK (role = OLD.role)` on self-update policy with `trg_prevent_self_role_change` trigger |

---

## Open Security Findings

The following findings are tracked but not yet fixed. Full details in `evidence/security-audit.json`.

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| SA-001 | MEDIUM | Non-CSPRNG invite code generation (`random()` in `generate_invite_code`) | Tracked / Not yet fixed |
| SA-004 | MEDIUM | `khatm_participants` INSERT policy does not validate invite code server-side | Tracked / Not yet fixed |
| SA-005 | MEDIUM | `khatm_groups` INSERT policy missing `WITH CHECK (admin_user_id = auth.uid())` | Tracked / Not yet fixed |
| SA-010 | MEDIUM | `notification-scheduler` Edge Function has no authentication header check | Tracked / Not yet fixed |
| SA-013 | MEDIUM | `useCreateKhatm` is non-transactional — orphaned rows on partial failure | Tracked / Not yet fixed |
| SA-015 | MEDIUM | TOCTOU race condition in `claim_juz` — concurrent claims can exceed `max_per_juz` | Tracked / Not yet fixed |
| SA-016 | MEDIUM | `claim_juz` and `start_new_cycle` RPCs do not write audit log entries | Tracked / Not yet fixed |
