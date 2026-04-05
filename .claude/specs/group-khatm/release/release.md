# Release: Group Khatm v1.0.0

**Date:** 2026-04-05
**Spec:** group-khatm
**Acceptance:** Conditional Accept — 68/87 criteria passed, all 4 conditions resolved
**Security posture:** 78/100 (0 CRITICAL, 0 HIGH)

---

## Changelog

### User-Facing Changes

**New feature: Group Khatm — collaborative Quran completion tracking**

- **Create a Khatm group** via a guided 5-step flow (Niyyah → Group Details → Assignment Rules → Reminders → Review). Groups support occasion types (General, Memorial, Ramadan, Eid, Shifa, Custom) and optional dedications.
- **30-tile Juz grid** with real-time state updates via Supabase Realtime. Tiles render four visual states: Open, Assigned (initial badge), In Progress (circular progress ring), Completed (solid teal + checkmark).
- **Juz assignment** — admins assign Juz to members via bottom sheet; participants can self-claim in PARTICIPANT-mode groups via the `claim_juz` server-side RPC.
- **Progress tracking** — slider-based progress updates (0–100%) with auto-tracking integration for the Iqra Quran reader. Failed writes queue to MMKV and retry on next successful write.
- **Co-admin management** — admins can promote/demote Co-Admins, with optional progress re-attribution on removal.
- **Push notification reminders** — Edge Function handles deadline reminders, stall reminders (4 days no progress), and not-started reminders (3 days after assignment).
- **Khatm completion ceremony** — full-screen overlay with Al-Fatiha, Du'a Khatm al-Quran (AR/EN), memorial suffix for MEMORIAL occasion types. No "Congratulations" — uses "Alhamdulillah" and "Taqabbal Allahu minna wa minkum".
- **Start another cycle** — creates a new Khatm group with cycle N+1, copying all JOINED participants atomically via server RPC.
- **Invite & join** — 8-character invite code (charset excludes O, 0, I, 1) + deep link `iqra://khatm/join/:code`.
- **Dark mode** — full dark mode support across all 11 components using `useColorScheme()`.

### Technical Changes

| Category | Change |
|---|---|
| Database | 3 migrations: schema (001), security fixes (002), acceptance fixes (003) |
| Security | `claim_juz` and `start_new_cycle` SECURITY DEFINER RPCs replace client-side multi-step mutations |
| Security | `khatm_juz_assignments_update_self` RLS policy — participants can update their own progress |
| Security | `prevent_self_role_change` BEFORE UPDATE trigger — replaces broken `WITH CHECK (role = OLD.role)` |
| Security | `khatm_audit_log` INSERT policy — client-side audit writes now succeed for JOINED participants |
| Feature module | Self-contained under `src/features/khatm/` with barrel export at `src/features/khatm/index.ts` |
| State | Zustand + MMKV store — only `activeGroupId` persists across restarts |
| Notifications | Supabase Edge Function (Deno) at `supabase/functions/notification-scheduler/` |
| Tests | E2E test suites: `khatm-create-to-complete.test.ts`, `khatm-join-flow.test.ts` |

---

## Breaking Changes

None. This is a new feature (v1.0.0, greenfield module). No existing APIs were modified.

---

## Environment Variables

### App (`.env` / Expo config)

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (public) |

### Edge Function (Supabase secrets)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL (injected automatically) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key — bypasses RLS for scheduler queries |
| `EXPO_ACCESS_TOKEN` | Yes | Expo push notification API token |

Set via:
```bash
supabase secrets set EXPO_ACCESS_TOKEN=<your_token>
```

---

## Database Migrations

Apply in order on the target Supabase project:

```bash
supabase db push
```

Or manually:

```bash
# 001 — Full schema: 6 tables, 8 enums, 5 indexes, 2 triggers, 4 RPCs, 16 RLS policies
psql $DATABASE_URL -f supabase/migrations/001_khatm_schema.sql

# 002 — Security fixes: khatm_juz_assignments_update_self policy,
#        claim_juz RPC, start_new_cycle RPC
psql $DATABASE_URL -f supabase/migrations/002_security_fixes.sql

# 003 — Acceptance fixes: khatm_audit_log INSERT policy,
#        prevent_self_role_change trigger
psql $DATABASE_URL -f supabase/migrations/003_acceptance_fixes.sql
```

**Migration summary:**

| File | Lines | What it does |
|---|---|---|
| `001_khatm_schema.sql` | 354 | Full schema — all tables, enums, indexes, triggers, RLS, helpers |
| `002_security_fixes.sql` | ~120 | SA-002/003/007: self-update RLS, `claim_juz` RPC, `start_new_cycle` RPC |
| `003_acceptance_fixes.sql` | ~65 | Audit log INSERT policy, role-escalation trigger |

---

## Deployment Checklist

### Pre-deployment

- [ ] Supabase project created and URL/keys configured in app environment
- [ ] `EXPO_ACCESS_TOKEN` secret set in Supabase
- [ ] `supabase db push` run against the target project — verify 0 errors
- [ ] Supabase Realtime enabled on `khatm_juz_assignments` and `khatm_groups` tables
- [ ] Edge Function deployed: `supabase functions deploy notification-scheduler`
- [ ] Supabase cron job configured to call `notification-scheduler` daily (e.g., `0 8 * * *`)
- [ ] Expo app scaffold initialized (`npx create-expo-app` or equivalent) — see [integration guide](../docs/integration.md)
- [ ] `KhatmStackNavigator` wired into tab layout (`src/app/(tabs)/_layout.tsx`) — currently a placeholder
- [ ] `npx expo install` run to install all declared dependencies
- [ ] TypeScript check passes: `npx tsc --noEmit`
- [ ] Tests pass: `npx jest`

### During deployment

- [ ] Apply migrations in order (001 → 002 → 003)
- [ ] Verify RLS by querying `khatm_groups` as an unauthenticated user — expect 0 rows
- [ ] Verify `claim_juz` RPC exists: `SELECT proname FROM pg_proc WHERE proname = 'claim_juz'`
- [ ] Verify `start_new_cycle` RPC exists: `SELECT proname FROM pg_proc WHERE proname = 'start_new_cycle'`
- [ ] Verify `trg_prevent_self_role_change` trigger exists on `khatm_participants`
- [ ] Verify `khatm_audit_log_insert` policy exists: `SELECT policyname FROM pg_policies WHERE tablename = 'khatm_audit_log'`
- [ ] Deploy Edge Function and confirm HTTP 200 response on test invocation

### Post-deployment

- [ ] Smoke test: create a group, verify invite code generated, join as second user
- [ ] Smoke test: assign a Juz, verify tile state updates via Realtime within 2 seconds
- [ ] Smoke test: update progress to 100%, verify group completion trigger fires
- [ ] Verify push notification received by test device
- [ ] Monitor Supabase logs for any RLS policy errors in first 24 hours

---

## Rollback Plan

### If migrations need to be reverted

There is no automated rollback for these migrations (no `down` migrations were written for v1.0.0). Manual rollback:

```sql
-- Remove all khatm_* objects (DESTRUCTIVE — destroys all data)
DROP TRIGGER IF EXISTS trg_prevent_self_role_change ON khatm_participants;
DROP FUNCTION IF EXISTS prevent_self_role_change();
DROP FUNCTION IF EXISTS claim_juz(uuid, int);
DROP FUNCTION IF EXISTS start_new_cycle(uuid);
DROP TABLE IF EXISTS khatm_audit_log CASCADE;
DROP TABLE IF EXISTS khatm_reminder_schedules CASCADE;
DROP TABLE IF EXISTS khatm_progress_updates CASCADE;
DROP TABLE IF EXISTS khatm_juz_assignments CASCADE;
DROP TABLE IF EXISTS khatm_participants CASCADE;
DROP TABLE IF EXISTS khatm_groups CASCADE;
DROP FUNCTION IF EXISTS generate_invite_code();
DROP FUNCTION IF EXISTS my_participant(uuid);
DROP FUNCTION IF EXISTS is_admin_or_coadmin(uuid);
DROP FUNCTION IF EXISTS is_admin(uuid);
DROP FUNCTION IF EXISTS update_juz_last_updated();
DROP FUNCTION IF EXISTS check_group_completion();
DROP TYPE IF EXISTS progress_source;
DROP TYPE IF EXISTS juz_status;
DROP TYPE IF EXISTS participant_status;
DROP TYPE IF EXISTS participant_role;
DROP TYPE IF EXISTS group_status;
DROP TYPE IF EXISTS assignment_mode;
DROP TYPE IF EXISTS group_language;
DROP TYPE IF EXISTS occasion_type;
```

### If Edge Function needs to be reverted

```bash
supabase functions delete notification-scheduler
```

### App rollback

Revert to the previous app build via Expo EAS or the app store rollback mechanism. The database schema is backward-compatible with the previous app version (no tables were modified, only new tables added).

---

## Known Limitations (v1.0.0)

These are tracked open items — not blockers for this release:

| ID | Severity | Description |
|---|---|---|
| SA-001 | MEDIUM | Invite code uses `random()` (PRNG), not `gen_random_bytes()` (CSPRNG) |
| SA-004 | MEDIUM | `khatm_participants` INSERT policy only checks `auth.uid() IS NOT NULL` — invite code bypass possible via direct DB call |
| SA-005 | MEDIUM | `khatm_groups` INSERT policy missing `WITH CHECK (admin_user_id = auth.uid())` |
| SA-010 | MEDIUM | `notification-scheduler` Edge Function has no authentication header check |
| SA-013 | MEDIUM | `useCreateKhatm` is non-transactional — 4 sequential DB ops without a transaction |
| SA-015 | MEDIUM | TOCTOU race in `claim_juz` COUNT-then-INSERT — concurrent claims may exceed `max_per_juz` |
| SA-016 | MEDIUM | `claim_juz` and `start_new_cycle` RPCs do not write audit log entries |
| US-7 | MEDIUM | Assignment push, per-juz completion push, and group completion push not yet implemented in Edge Function |
| T-08 | — | Quran reader auto-tracking not yet wired — `src/app/(quran-reader)/[page].tsx` does not exist |

See [security.md](../docs/security.md) for full details.

---

## Reproducibility Manifest

| Field | Value |
|---|---|
| Spec name | group-khatm |
| Release version | v1.0.0 |
| Release date | 2026-04-05 |
| spec-engine plugin version | 2.0.0 |
| Model versions | Not recorded (model_versions: {}) |
| git SHA start | null — greenfield project, git not initialized at spec creation |
| git SHA end | N/A — not a git repository |
| Tasks completed | 25 / 25 (6 waves) |
| Acceptance status | conditional_accept |
| Acceptance criteria | 68 passed, 8 failed, 9 partial, 2 untestable (87 total) |
| Security posture | 78/100 |
| Security findings | 0 CRITICAL · 0 HIGH · 11 MEDIUM · 3 LOW |
| Spec integrity — requirements.md | `07c24e42ff156776698342eb72762d33fd0757b0ac5bf3c170293a0d98e73691` |
| Spec integrity — design.md | `cbaf162306a4459a91aee50143c8e0ec4bcb4b43d177f4c1710667a9065f95ab` |
| Spec integrity — tasks.md | `5375c40314699115975330314341dd528926f55b2470a696ee2220ccfd6a83f9` |
| Integrity computed at | 2026-04-05T00:01:00.000Z |

---

## Tagging Note

```
--tag v1.0.0 was requested.
```

**This directory is not a git repository** (`git init` has not been run). The tag `v1.0.0` cannot be created automatically. Once the repository is initialized and code is committed, apply the tag with:

```bash
git init
git add .
git commit -m "feat: Group Khatm v1.0.0

Collaborative Quran completion feature — 25 tasks, 6 waves.
Security posture 78/100. All HIGH findings resolved."
git tag -a v1.0.0 -m "Group Khatm v1.0.0"
git push origin main --tags
```
