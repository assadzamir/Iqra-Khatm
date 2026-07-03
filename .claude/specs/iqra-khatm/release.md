# Release: iqra-khatm v1.0.0

> Generated: 2026-04-08
> Spec: iqra-khatm | Plugin: spec-engine v2.0.0
> Security posture: 93/100 | Critical findings: 0

---

## Changelog

### User-Facing Changes

#### Authentication
- **Email + password signup** — Create an account with email and password. Confirmation email sent via Supabase Auth.
- **Email + password login** — Log in with email and password. Failed attempts show "Invalid email or password" without field-level hints.
- **Forgot password** — Password reset via email. Uniform response regardless of whether email is registered.
- **Phone + OTP login** — Sign in with a phone number (E.164 format) and a one-time SMS passcode. 60-second resend cooldown.
- **Display name onboarding** — First-time users are prompted to set a display name (2–50 characters) before accessing the app.
- **Session persistence** — Auth sessions are persisted across app restarts via AsyncStorage; no re-login required.
- **Sign-out** — Signs out from all Supabase sessions. Clears cached data, pending offline operations, and query cache on sign-out.

#### Quran Reader
- **Page-by-page reading** — Full Arabic text (Uthmani script) for all 604 Mushaf pages, fetched from alquran.cloud.
- **Translation toggle** — Enable/disable English translation (Abdullah Yusuf Ali `en.asad` edition) per verse.
- **Font size picker** — Three sizes: Small (18px), Medium (24px), Large (32px). Persisted across sessions.
- **Theme picker** — Light, Dark, and Sepia themes. Persisted across sessions.
- **Swipe navigation** — Swipe left/right to advance or go back one page.
- **Previous / Next buttons** — Disabled at page boundaries (1 and 604).
- **Juz jump** — Bottom sheet picker listing all 30 Juz with Arabic names. Tapping jumps to the first page of the Juz.
- **Bookmarks** — Save and delete bookmarks for any page. Bookmarks list opens in a bottom sheet with one-tap navigation. Works offline (synced when back online).
- **Khatm auto-tracking** — When reading within an active Khatm group context, progress is tracked automatically and a banner shows the active Juz assignment. Out-of-range pages show a 3-second toast.
- **24-hour cache** — Page data cached for 24 hours. Re-fetches on next app open after expiry.

#### Email Notifications
- **Khatm reminder emails** — Participants with an email address on file receive daily reminder emails for: upcoming deadlines, unstarted Juz assignments, and stalled progress.
- **Unsubscribe link** — Each email includes an unsubscribe link. Clicking it disables email notifications for that participant without requiring login.
- **Parallel with push** — Email send failures do not affect existing push notification delivery.

---

### Technical Changes

#### New files
| File | Description |
|------|-------------|
| `supabase/migrations/005_auth_reader_email.sql` | New tables: `user_profiles`, `user_bookmarks`. Adds `email`, `email_notifications_enabled` to `khatm_participants`. RLS on all new tables. |
| `src/features/auth/types.ts` | `UserProfile` type |
| `src/features/quran-reader/types.ts` | `FontSize`, `ReaderTheme`, `QuranVerse`, `QuranPageData`, `TranslationVerse`, `Bookmark`, theme/size constants |
| `src/features/auth/store.ts` | Zustand `useAuthStore` — session, profile, loading state |
| `src/features/quran-reader/api/quranApi.ts` | alquran.cloud API client — 10s AbortController timeout, 429 retry |
| `src/features/quran-reader/hooks/useQuranPage.ts` | TanStack Query hook — 24h staleTime, RATE_LIMIT retry |
| `src/features/quran-reader/hooks/useTranslation.ts` | TanStack Query hook — enabled flag, 24h staleTime |
| `src/features/quran-reader/hooks/useReaderSettings.ts` | MMKV-persisted font size, theme, translation toggle |
| `src/features/quran-reader/hooks/useBookmarks.ts` | Supabase bookmarks with optimistic updates and MMKV offline queue |
| `src/features/quran-reader/components/QuranPageRenderer.tsx` | Arabic text renderer with translation, loading, and error states |
| `src/features/quran-reader/components/ReaderToolbar.tsx` | Font/theme/translation/bookmark controls |
| `src/features/quran-reader/components/PageNavigationBar.tsx` | Prev/Next buttons and Juz jump modal |
| `src/features/quran-reader/components/BookmarkSheet.tsx` | Bottom sheet for bookmarks list |
| `src/app/_layout.tsx` | Root layout — QueryClientProvider, auth session listener, route protection |
| `src/app/(auth)/_layout.tsx` | Auth route group stack layout |
| `src/app/(auth)/index.tsx` | Auth route guard — redirects based on session + profile state |
| `src/app/(auth)/login.tsx` | Login screen |
| `src/app/(auth)/signup.tsx` | Signup screen |
| `src/app/(auth)/otp.tsx` | Phone + OTP screen |
| `src/app/(auth)/forgot-password.tsx` | Forgot password screen |
| `src/app/(auth)/onboarding.tsx` | Display name onboarding screen |
| `supabase/functions/email-notifications/index.ts` | Deno Edge Function — Resend API email dispatch with JWT unsubscribe tokens |
| `supabase/functions/email-unsubscribe/index.ts` | Deno Edge Function — JWT-verified unsubscribe handler (`iss`+`aud` validation) |
| `tests/e2e/auth-reader-flow.test.ts` | Auth flow E2E tests (5 cases) |
| `tests/e2e/reader-flow.test.ts` | Reader flow E2E tests (7 cases) |

#### Modified files
| File | Change |
|------|--------|
| `src/lib/supabase.ts` | Added AsyncStorage auth adapter (`persistSession: true`, `autoRefreshToken: true`) |
| `src/app/(tabs)/_layout.tsx` | Added Supabase Auth guard — redirects unauthenticated users to login |
| `src/app/(quran-reader)/[page].tsx` | Replaced placeholder with full orchestrator (swipe, khatm banner, out-of-range toast, all sub-components) |
| `supabase/functions/notification-scheduler/index.ts` | Added email dispatch pipeline; added Bearer token auth at entry; removed error detail from response body |
| `package.json` | Added `@react-native-async-storage/async-storage ^2.1.2` |
| `tsconfig.json` | Added `supabase/functions/**` to exclude to prevent Deno type conflicts |

---

## Breaking Changes

None. All database changes are additive (new tables, new nullable columns on existing table). No existing API contracts, Zustand store shapes, or component interfaces were changed.

---

## Environment Variables Required

### React Native App (`.env` / EAS secrets)
| Variable | Description | Example |
|----------|-------------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Already required by group-khatm | `https://xxx.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Already required by group-khatm | `eyJhbGciOi...` |

### Supabase Edge Function Secrets
| Variable | Description | Notes |
|----------|-------------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for authenticating scheduler → email-notifications calls | Already used by notification-scheduler |
| `RESEND_API_KEY` | Resend API key for email delivery | New — set via `supabase secrets set RESEND_API_KEY=re_...` |
| `EMAIL_FROM_ADDRESS` | Verified sender address (e.g. `noreply@iqra-app.com`) | New — must match Resend verified sending domain |
| `APP_BASE_URL` | Base URL for unsubscribe link in emails (e.g. `https://iqra-app.com`) | New — used to build the unsubscribe endpoint URL |

### Open Configuration Decisions (Required Before Deployment)
1. **Resend sending domain**: Register and verify a sending domain in the Resend dashboard. Update `EMAIL_FROM_ADDRESS` to a verified address.
2. **Supabase phone auth**: Enable phone authentication in the Supabase dashboard under Authentication → Providers. Requires Twilio or MessageBird credentials.
3. **Translation edition**: The app currently uses `en.asad` (Muhammad Asad). Change `fetchTranslationPage` second argument if a different edition is preferred.

---

## Database Migrations

### Migration 005: `supabase/migrations/005_auth_reader_email.sql`

**Tables created:**
- `user_profiles` — one row per `auth.users` entry, created during onboarding
- `user_bookmarks` — Quran page bookmarks per user (max 200 per user, enforced at query level)

**Tables modified:**
- `khatm_participants` — new nullable columns `email` and `email_notifications_enabled` (DEFAULT true). Existing rows unaffected (email = NULL, email_notifications_enabled = true).

**Run order:** This migration must run after migrations 001-004 (it references `auth.users` and `khatm_participants` from earlier migrations).

**Command:**
```bash
supabase db push
# or for production:
supabase migration up --linked
```

---

## Edge Functions

Two new Deno Edge Functions must be deployed:

```bash
supabase functions deploy email-notifications
supabase functions deploy email-unsubscribe

# Set required secrets (production)
supabase secrets set \
  RESEND_API_KEY=re_... \
  EMAIL_FROM_ADDRESS=noreply@iqra-app.com \
  APP_BASE_URL=https://iqra-app.com
```

The existing `notification-scheduler` function must be redeployed to pick up the email dispatch additions and security fixes:

```bash
supabase functions deploy notification-scheduler
```

---

## Rollback Plan

### Database rollback
```sql
-- Remove the new columns from khatm_participants
ALTER TABLE khatm_participants
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS email_notifications_enabled;

-- Drop new tables (CASCADE removes RLS policies automatically)
DROP TABLE IF EXISTS user_bookmarks;
DROP TABLE IF EXISTS user_profiles;
```

### Edge Function rollback
```bash
# Re-deploy the previous version of notification-scheduler (before email dispatch was added)
# The email-notifications and email-unsubscribe functions can simply be left deployed —
# they will not be invoked without the notification-scheduler calling them.
```

### App rollback
Revert the following files to their pre-spec state:
- `src/lib/supabase.ts` — remove AsyncStorage adapter
- `src/app/(tabs)/_layout.tsx` — remove auth guard
- `src/app/(quran-reader)/[page].tsx` — restore original placeholder
- `package.json` — remove `@react-native-async-storage/async-storage`
- `tsconfig.json` — remove `supabase/functions/**` from exclude

The `src/app/(auth)/`, `src/features/auth/`, and `src/features/quran-reader/` directories can remain — they are only reachable via the auth guard and root layout which would be reverted.

---

## Deployment Checklist

### Pre-deployment
- [ ] Resend sending domain verified and `EMAIL_FROM_ADDRESS` confirmed
- [ ] Supabase phone authentication enabled (Twilio/MessageBird configured)
- [ ] `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `APP_BASE_URL` set as Supabase secrets
- [ ] Migration 005 reviewed and approved for production database
- [ ] `APP_BASE_URL` points to the production domain (used in email unsubscribe links)

### During deployment
- [ ] Run `supabase migration up --linked` (migration 005)
- [ ] Run `supabase functions deploy email-notifications`
- [ ] Run `supabase functions deploy email-unsubscribe`
- [ ] Run `supabase functions deploy notification-scheduler` (updated version)
- [ ] Build and submit app via EAS: `eas build --platform all --profile production`

### Post-deployment
- [ ] Verify `user_profiles` and `user_bookmarks` tables exist in Supabase dashboard
- [ ] Verify RLS policies are active on both tables
- [ ] Test signup flow end-to-end on a staging environment
- [ ] Test email unsubscribe link with a real email (verify JWT validation works)
- [ ] Confirm notification-scheduler responds with 401 to unauthenticated requests
- [ ] Verify `email-notifications` function returns 401 for requests without service-role key
- [ ] Smoke test Quran reader page load on both iOS and Android builds
- [ ] Verify bookmark sync (add → kill app → reopen → verify bookmark persisted)

---

## Reproducibility Manifest

| Field | Value |
|-------|-------|
| spec_name | iqra-khatm |
| spec_engine_version | 2.0.0 |
| created_at | 2026-04-05T00:00:00.000Z |
| completed_at | 2026-04-08T00:16:00Z |
| tasks_total | 25 |
| waves_total | 7 |
| git_sha_start | null (no git tracking during spec execution) |
| git_sha_head | eff90c3 |
| model_versions | claude-sonnet-4-6 |
| security_posture | 93/100 |
| threat_model_criteria | 10/10 PASS |
| acceptance | ACCEPTED 2026-04-08 |

---

## Security Summary

| Finding | Severity | Status |
|---------|----------|--------|
| SA-001: notification-scheduler missing auth | HIGH | Fixed — Bearer token check added |
| SA-002: error response exposes internal details | MEDIUM | Fixed — detail field removed |
| All 10 threat-model criteria | — | PASS (verified with file:line evidence) |
