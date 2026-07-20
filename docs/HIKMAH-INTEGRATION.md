# Iqra-Khatm → Hikmah: Integration Handoff

Audience: the full-stack engineer folding this codebase into the Hikmah app.
This doc tells you what the system is, what state it's in, exactly what has to
change to rebrand/embed it, and the sharp edges we already know about.

Last verified: 2026-07-03 · `tsc --noEmit`: **0 errors** · Tests: **99/99
passing (8 suites)** · everything committed on `main`.

---

## 1. What this app is

Three feature areas, all working end-to-end:

1. **Khatm groups** (`src/features/khatm/`) — create a group with an end date,
   invite by code, assign or self-claim Juz (admin vs participant modes),
   track per-Juz progress with an audit log, celebrate completion. Push
   reminders via a daily scheduler.
2. **Quran reader** (`src/features/quran-reader/`, route
   `/(quran-reader)/[page]`) — 604-page Mushaf from alquran.cloud, translation
   toggle, font/theme settings (MMKV-persisted), bookmarks with an offline
   queue, swipe/button/Juz-jump navigation. When opened via a khatm
   assignment ("Start Reading"), progress auto-tracks against that Juz.
3. **Auth + email notifications** — Supabase email/password + phone OTP,
   display-name onboarding, route guards; daily reminder emails (deadline
   approaching, Juz not started, Juz stalled) via Resend, with JWT-verified
   one-click unsubscribe.

### Architecture at a glance

```
Expo app (React 19 / RN 0.81 / expo-router)
  ├─ Zustand: useAuthStore (session+profile), useKhatmStore (active group/reading ctx)
  ├─ TanStack Query: khatm screen data, quran pages, bookmarks (24h cache on quran data)
  ├─ MMKV: reader settings, offline bookmark queue  ← src/lib/mmkv.ts (sync adapter)
  └─ supabase-js: auth (AsyncStorage persistence), Postgres w/ RLS, Realtime

Supabase
  ├─ migrations 001-005: khatm schema, RLS, triggers; 005 adds
  │    user_profiles, user_bookmarks, khatm_participants.email(+enabled)
  └─ Edge functions (Deno):
       notification-scheduler  ← daily cron (0 6 * * * UTC), service-role auth
         ├─ push via Expo Push API (batched dedup + token lookup)
         └─ calls → email-notifications  ← Resend send, batched dedup,
                       audit rows in khatm_audit_log (EMAIL_SENT/EMAIL_FAILED)
       email-unsubscribe       ← public GET, verifies JWT from _shared/jwt.ts
```

Key invariants worth knowing before you touch things:

- **`khatm_participants` rows are per-group membership**, not per user. A user
  in 3 groups has 3 participant rows (and 3 independent
  `email_notifications_enabled` flags — see §5).
- **Email dedup** is `(participant_id, event_type, day)` against
  `khatm_audit_log` rows with `action_type='EMAIL_SENT'`; the top-level
  `group_id` column on that table is NOT NULL — every insert must set it.
- **Push dedup** is `(assignment_id, day)` against `NOTIFICATION_SENT` rows.
- The unsubscribe JWT contract (HS256 via `SUPABASE_JWT_SECRET`,
  `aud='email-unsubscribe'`, 30-day expiry) lives in **one module**:
  `supabase/functions/_shared/jwt.ts`. Signer and verifier both import it —
  keep it that way.
- `TOTAL_QURAN_PAGES` / `isValidQuranPage` in
  `src/features/quran-reader/types.ts` are the single source of truth for page
  bounds. Don't reintroduce literal `604`s.

---

## 2. Current state & history

- Feature work was built spec-driven; the full spec, STRIDE threat model,
  15-phase security audit (93/100, 0 critical), release notes, and retro are
  in `.claude/specs/iqra-khatm/`.
- A deep post-implementation code review found and fixed 10 confirmed bugs
  (commits `4b6cf5e` P1–P6 and `3a21f4e` S1–S3): reader unreachability, dead
  email pipeline, reanimated-4 swipe crash, auth-screen stranding, wrong
  translations on multi-surah pages, offline-bookmark data loss, N+1 queries,
  and JWT contract duplication. Read those two commit messages for the full
  list.
- `fa14f2c` cleared all typecheck errors and installed missing native deps
  (`@react-native-async-storage/async-storage`, `react-native-svg@15.12.1`).

CI baseline to preserve: `npx jest --ci` → 99/99, `npx tsc --noEmit` → 0.

---

## 3. Integration touchpoints (the actual Hikmah work)

These are the places where "Iqra-Khatm the standalone app" leaks into code and
must become Hikmah-aware. Grep-able list:

| # | Touchpoint | Where | What to do |
|---|---|---|---|
| 1 | App identity | `app.json` — `name`, `slug`, `scheme: "iqra-khatm"`, icons/splash | Merge into Hikmah's app config. If Hikmah has its own `app.json`, these route groups and plugins need to move over. |
| 2 | **Deep link scheme in emails** | `supabase/functions/email-notifications/index.ts` — hardcoded `href="iqra-khatm://khatm"` in the HTML template | Change to Hikmah's scheme + the khatm route inside Hikmah. This is easy to miss and silently breaks "Open app" buttons in every email. |
| 3 | **Email branding** | same file — hardcoded `from: 'Iqra Khatm <notifications@iqra-app.com>'`, subject/body copy, unsubscribe page HTML in `email-unsubscribe/index.ts` | Update sender (must match a Resend-verified domain for Hikmah), product name in copy. Note: the release notes mention an `EMAIL_FROM_ADDRESS` env var, but **the code currently hardcodes the from address** — parameterize it while you're in there. |
| 4 | Route mounting | `src/app/` route groups: `(auth)`, `(tabs)`, `(quran-reader)` | If Hikmah already has auth/tabs, mount `(quran-reader)` + the khatm screens into Hikmah's navigator and drop this repo's `(auth)`/`(tabs)` shells. The reader route only depends on `useAuthStore` (for bookmarks) and `useKhatmStore` (optional reading context) — it works without a khatm context. |
| 5 | Auth store vs Hikmah auth | `src/app/_layout.tsx` + `src/features/auth/store.ts` | The session listener populates `useAuthStore` (session + `user_profiles` row). If Hikmah has its own auth, adapt the store to read from Hikmah's session source; everything downstream only consumes `useAuthStore`. |
| 6 | Supabase project | `.env` / `src/lib/supabase.ts` | Point `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` at Hikmah's project and run migrations 001→005 there (001-004 khatm schema, 005 auth/reader/email — order matters). All 005 changes are additive. |
| 7 | Theme/branding in screens | auth screens + reader components use hardcoded palettes (`#0D9488` teal, `KHATM_COLORS`, `THEME_COLORS`) | Swap to Hikmah's design tokens. Warning: the five auth screens each carry a **copy of the palette/styles/email-regex** (known cleanup debt, §5) — consolidate while rebranding or you'll restyle five files. |
| 8 | Cron schedule | Supabase dashboard / `supabase functions` config | Re-create the daily `notification-scheduler` cron (0 6 * * * UTC) on Hikmah's project, invoked with the service-role key as Bearer token (it 401s anything else). |
| 9 | Package identity | `package.json` name, EAS project in `eas.json` | Merge per Hikmah's release setup. |

Dependency merge notes: the app needs `react-native-mmkv` v3,
`react-native-reanimated` ~4.1 + `react-native-worklets`,
`react-native-gesture-handler`, `@gorhom/bottom-sheet`,
`@react-native-async-storage/async-storage`, `react-native-svg` (use Expo's
bundled versions — `npx expo install`), TanStack Query v5, Zustand. If Hikmah
already includes any of these, dedupe versions rather than duplicating.

---

## 4. Environments & deployment

App env (see `.env.example`):

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Edge function secrets: `RESEND_API_KEY` must be set
(`supabase secrets set RESEND_API_KEY=re_...`). `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` come from the platform.

Deploy order (fresh environment): migrations 001→005 → deploy
`email-notifications`, `email-unsubscribe`, `notification-scheduler` → set
secrets → configure cron. The full pre/during/post checklist with smoke tests
is in `.claude/specs/iqra-khatm/release.md` §Deployment Checklist. Manual
platform setup you cannot script: verify a Resend sending domain, and enable
phone auth (Twilio/MessageBird) in Supabase → Authentication → Providers.

**Node:** use `.nvmrc` (20.19.4). On Node 23 the yarn install fails engine
checks (`eslint-visitor-keys` wants 20.19+/22.13+/24+) and `expo lint`'s
eslint auto-install fails the same way. Everything works on the pinned
version. Node 22 LTS or 24 also satisfy the ranges if Hikmah standardizes
elsewhere.

---

## 5. Known caveats & deliberate debt (honest list)

Product/behavior:

1. **Unsubscribe is per group-membership, not per user.** The flag lives on
   `khatm_participants` (one row per group), but the unsubscribe page says
   "unsubscribed from email notifications" globally. A user in several groups
   keeps getting email from the others. Decide Hikmah's intended semantics;
   if global, hang the preference on `user_profiles` instead and update both
   edge functions.
2. **Email dedup is per (participant, event-type, day)** — a participant with
   two stalled Juz in one group gets one email but two pushes that day.
   Accepted for v1.
3. **Offline bookmark queue flushes only on the next bookmark toggle while
   online** — there's no reconnect listener or app-start flush. Queued ops are
   never lost (failures requeue), but they can sit until the user next touches
   a bookmark. A NetInfo/app-foreground flush is the natural upgrade.
4. **Quran text is a runtime dependency on alquran.cloud** (24h TanStack
   cache, 10s timeout, 429 retry). No offline corpus. If Hikmah needs
   guaranteed offline reading, bundle a local text source behind
   `quranApi.ts`'s interface.
5. **Translation edition is hardcoded** to `en.asad`
   (`fetchTranslationPage`'s default). Parameterize if Hikmah offers a choice.

Code quality (flagged in review, consciously deferred):

6. The five auth screens duplicate palette/styles/`EMAIL_REGEX`/error-mapping
   (~60 lines each, already drifting — placeholder colors differ). Consolidate
   into shared auth theme/components when rebranding (§3.7).
7. `quranApi.ts` duplicates its fetch/timeout/429 wrapper across its two
   functions; `useReaderSettings` uses a second MMKV instance
   (`quran-reader-settings`) that sign-out cleanup in `_layout.tsx` does not
   clear (currently holds only non-sensitive display prefs).
8. No ESLint config. `expo lint` will bootstrap eslint@9 on first run (pinned
   Node required). Adopt Hikmah's lint config instead if one exists.
9. Deadline-reminder fallback filters schedules by date **in JS** after
   fetching all active rows (`notification-scheduler` §processDeadlineReminders)
   — fine at current scale; push the date filter into SQL/RPC if group count
   grows.

Testing:

10. `yarn test` runs `jest --watchAll` (never exits). CI must use
    `npx jest --ci`. The e2e suites are jest-level integration tests (mocked
    supabase/router), not device tests; there is no Detox/Maestro coverage.
11. Known-benign warnings: `@testing-library/react-native` peer-dep complaint
    about `react-test-renderer`, and an act() warning in
    `reader-flow.test.ts`'s settings test.

---

## 6. Where to read more

| Doc | Contents |
|---|---|
| `.claude/specs/iqra-khatm/requirements.md` | User stories + EARS acceptance criteria (incl. 10 threat-model criteria) |
| `.claude/specs/iqra-khatm/design.md` | Architecture decisions, data model, component contracts |
| `.claude/specs/iqra-khatm/evidence/security-audit.json` | 15-phase audit findings (93/100) |
| `.claude/specs/iqra-khatm/evidence/threat-model.md` | STRIDE analysis |
| `.claude/specs/iqra-khatm/release.md` | v1.0.0 release notes, env matrix, rollback plan, deployment checklist |
| `.claude/specs/iqra-khatm/retro.md` | What went well/poorly during the build |
| `docs/khatm-research-compilation.md` | Product research behind khatm mechanics |

Questions the docs can't answer are probably answered by `git log` — the
commit messages on `main` are written as change narratives.
