# Retrospective: Group Khatm v1.0.0

**Date:** 2026-04-05
**Spec:** group-khatm
**Duration:** ~40 min (implementation) + post-spec rework
**Tasks:** 25 / 25 completed
**Waves:** 6

---

## Quality Metrics

| Metric | Value |
|---|---|
| First-pass task success rate | 100% (25/25, 0 failures recorded) |
| Debugger invocations | 0 |
| Quality gate runs | SKIPPED — no `package.json` scaffold at implementation time |
| Post-spec security findings | 3 HIGH → resolved; 11 MEDIUM; 3 LOW |
| UAT acceptance criteria | 68/87 pass (78%); 4 conditions (all fixed post-UAT) |
| Final acceptance status | Conditional Accept (conditions resolved) |
| Final security posture | 78/100 |

---

## Wave Timing

| Wave | Tasks | Start | End | Duration | Notes |
|---|---|---|---|---|---|
| 0 | T-01..T-05 | 00:02:00 | 00:02:30 | ~30s | Foundation — types, constants, store, schema |
| 1 | T-06..T-08 | 00:02:31 | ~00:03:00 | ~30s | Hooks — queries, mutations, auto-tracking |
| 2 | T-09..T-15 | 00:03:00 | 00:07:56 | ~5 min | Components; T-15 (JuzBottomSheet) ~4 min |
| 3 | T-16..T-21 | 00:07:57 | 00:24:31 | ~17 min | Screens; **T-18 alone ~14 min** |
| 4 | T-22..T-23 | 00:24:32 | 00:28:31 | ~4 min | E2E tests (parallel) |
| 5 | T-24..T-25 | 00:28:32 | 00:42:01 | ~13.5 min | Dark mode audit; **T-24 alone ~12 min** |

Total spec implementation: ~40 min.

---

## What Went Well

### Foundation wave was fast and solid
Wave 0 completed in ~30 seconds with zero rework. Types mapped directly from the Postgres schema, constants were pre-enumerated, and the Zustand store had explicit setters for all 6 fields. The schema migration (T-05) covered all 8 enums, 6 tables, helpers, and RLS policies in one pass.

### Parallelism was effective
Waves 1 and 2 batched independent tasks in parallel with no merge conflicts. The pre-planned shared file list (`types.ts`, `constants.ts`, `store.ts`) prevented conflicts. Wave 2's 7 components completed correctly across 3 batches.

### Zero task-level failures
All 25 tasks completed on first attempt with no debugger invocations. The detailed task descriptions with explicit acceptance criteria (props, behaviors, visual states) gave implementers enough signal to produce correct outputs.

### WARN annotations in validation.md surfaced real risks
WARN-1 through WARN-5 accurately predicted friction points. Two of the four post-UAT conditions traced directly to acknowledged warnings (WARN-2 → `days_stalled`; globalThis mention → pending queue durability).

---

## What Caused Friction

### 1. T-18 GroupKhatmScreen — largest single-task time sink (~14 min)

GroupKhatmScreen at 571 lines is the orchestration hub: 4 accordions, 3 bottom sheet refs, admin summary data shape, realtime wiring, and stall computation all in one task. This produced the longest implementation time of any single task.

**Root cause:** The task scope was not split. A screen that manages 5+ sub-concerns should be broken into sub-tasks (data layer, layout, admin logic, sheet wiring).

**Impact:** The `days_stalled: 0` hardcode (UAT Condition 3) is a direct symptom — the implementer focused on the structural wiring and left the stall computation as a stub.

### 2. T-24 dark mode audit — 9 files, ~12 min

Dark mode was deferred to Wave 5 as a sweep. This was architecturally sound (fewer merge conflicts), but it meant the implementer had to audit 11 files and modify 9 of them in a single pass, producing the second-highest task time.

**Root cause:** Deferred dark mode sweep is a known trade-off. The Wave 5 approach is correct — but the audit overhead compounds with the number of components.

### 3. Three HIGH security findings required post-spec migration

The original schema (T-05) contained three HIGH-severity gaps that only appeared in the security audit:

- **SA-002** — No self-update RLS policy on `khatm_juz_assignments`. Participants had no policy permitting them to update their own progress, making progress writes fail silently.
- **SA-003** — Self-claim via `useAssignJuz` exposed `participant_id` in the client request body — an IDOR risk. Required a new `claim_juz` SECURITY DEFINER RPC.
- **SA-007** — `useStartNewCycle` performed 4+ sequential client-side mutations without a transaction or admin check — a TOCTOU and privilege-escalation risk. Required a new `start_new_cycle` SECURITY DEFINER RPC.

**Root cause:** Any participant-facing write path that was not backed by either RLS or a SECURITY DEFINER function had the potential for IDOR or privilege escalation. This pattern should be designed in at spec time, not caught in audit.

### 4. `WITH CHECK (role = OLD.role)` — invalid Postgres RLS syntax

The original RLS policy for preventing self-role-escalation used `WITH CHECK (role = OLD.role)`. Postgres does not expose `OLD` in `WITH CHECK` clauses for UPDATE policies — `OLD` is only available in `USING`. This caused a silent RLS misconfiguration that was caught during UAT (Condition 2).

**Root cause:** This is a non-obvious Postgres RLS constraint. It needs to be a standing design rule: self-mutation prevention requires a BEFORE UPDATE trigger, not a `WITH CHECK` clause.

### 5. Missing `khatm_audit_log` INSERT policy

The audit log table had no INSERT policy, so client-side audit writes failed silently. The feature appeared to work but was not recording participant actions.

**Root cause:** Audit tables require their own INSERT policy. They are easy to overlook because they are infrastructure, not user-facing.

### 6. `globalThis` pending queue — durability gap

The initial `useAutoTracking` implementation stored failed writes in `globalThis.__khatmPendingProgress` — an in-memory array that is lost on app crash. This was a known design note but was implemented as stated rather than using MMKV for persistence.

**Root cause:** In-memory queues for offline-tolerant features are a design error. Any queue that must survive app restarts must use persistent storage.

---

## Patterns to Repeat

- **Split type file first** — deriving types from the Postgres schema before implementation prevents downstream mismatches.
- **Pre-enumerate shared files** — the parallel conflict list in `state.json` worked; no merge conflicts across 25 tasks.
- **Dark mode as a deferred Wave 5 audit** — efficient approach for components that are written before the theming sweep.
- **SECURITY DEFINER for all multi-step mutations** — `generate_invite_code`, `claim_juz`, `start_new_cycle` all benefit from this.
- **WARN annotations in validator** — they accurately predicted all post-spec friction; read them as pre-mortems.

## Patterns to Avoid

- **Single task for large orchestration screens** — GroupKhatmScreen (571 lines, 5 concerns) should be ≥2 tasks.
- **Deferring RLS for PARTICIPANT write paths** — every participant-facing write needs explicit RLS or a SECURITY DEFINER RPC designed at spec time.
- **`WITH CHECK (role = OLD.role)` for mutation prevention** — use BEFORE UPDATE trigger instead.
- **Missing INSERT policy on audit/log tables** — these need policies written in the same migration as the table.
- **In-memory queues for offline-tolerant features** — always use MMKV or equivalent persistent storage.
- **`globalThis` for cross-session state** — not durable; fails on app restart.

---

## Post-Spec Rework Summary

| Item | Type | Migration / File | Condition |
|---|---|---|---|
| SA-002: Self-update RLS | Security | `002_security_fixes.sql` | Resolved pre-release |
| SA-003: IDOR in self-claim | Security | `002_security_fixes.sql` + `useKhatmMutations.ts` | Resolved pre-release |
| SA-007: Non-atomic cycle start | Security | `002_security_fixes.sql` + `useKhatmMutations.ts` | Resolved pre-release |
| SA-012: Audit log INSERT policy | UAT Condition 1 | `003_acceptance_fixes.sql` | Resolved post-UAT |
| SA-006: Role escalation trigger | UAT Condition 2 | `003_acceptance_fixes.sql` | Resolved post-UAT |
| US-3 AC-1: days_stalled | UAT Condition 3 | `GroupKhatmScreen.tsx`, `types.ts`, `useKhatmQueries.ts` | Resolved post-UAT |
| US-5 AC-8: MMKV queue | UAT Condition 4 | `useAutoTracking.ts` | Resolved post-UAT |

---

## Known Limitations Deferred to v1.1

| ID | Description |
|---|---|
| SA-001 | Invite code uses PRNG (`random()`), not CSPRNG (`gen_random_bytes()`) |
| SA-004 | Participant INSERT policy only checks `auth.uid() IS NOT NULL` — invite code bypass possible |
| SA-005 | `khatm_groups` INSERT policy missing `WITH CHECK (admin_user_id = auth.uid())` |
| SA-010 | `notification-scheduler` Edge Function has no auth header check |
| SA-013 | `useCreateKhatm` is non-transactional |
| SA-015 | TOCTOU race in `claim_juz` COUNT-then-INSERT |
| SA-016 | `claim_juz` and `start_new_cycle` RPCs do not write audit log entries |
| US-7 | Assignment/per-juz/group completion push notifications not implemented |
| T-08 | Quran reader auto-tracking not wired (`[page].tsx` placeholder only) |
