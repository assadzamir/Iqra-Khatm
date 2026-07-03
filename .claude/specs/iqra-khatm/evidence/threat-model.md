## Threat Model: iqra-khatm

### STRIDE Analysis

| Component | S | T | R | I | D | E |
|-----------|---|---|---|---|---|---|
| C-01: RootLayout | Stale session data persists after logout, enabling session fixation | - | - | - | - | Auth gate bypass if onAuthStateChange race condition occurs |
| C-02: AuthStore | - | - | - | Session object held in memory could be read via debug tools | - | - |
| C-03: LoginScreen | Credential stuffing without lockout | - | Failed login attempts not logged | Generic error prevents enumeration (good) | - | - |
| C-04: SignupScreen | - | - | - | Signup error reveals whether email exists in system | - | - |
| C-05: OTPScreen | OTP brute-force if rate limiting fails | - | - | Phone number exposed in client state | - | - |
| C-06: ForgotPasswordScreen | - | - | - | Consistent messaging prevents enumeration (good) | - | - |
| C-07: OnboardingScreen | - | Display name could contain script injection payload | - | - | - | - |
| C-08: QuranReaderPage | - | Page number URL param could be manipulated to non-integer values | - | - | - | - |
| C-09: QuranPageRenderer | - | - | - | - | - | - |
| C-10: ReaderToolbar | - | - | - | - | - | - |
| C-11: PageNavigationBar | - | - | - | - | - | - |
| C-12: BookmarkSheet | - | - | - | - | Unbounded bookmark list query could exhaust memory | - |
| C-13: useQuranPage | - | - | - | - | No fetch timeout; hung connection possible | - |
| C-14: useTranslation | - | - | - | - | No fetch timeout; hung connection possible | - |
| C-15: useBookmarks | - | MMKV offline queue entries could be tampered on rooted device | - | - | - | Expired session could replay queued bookmarks under wrong user context |
| C-16: useReaderSettings | - | - | - | - | - | - |
| C-17: Quran API Client | - | API response not validated against schema; malformed data could cause rendering errors | - | - | No request timeout configured | - |
| C-18: Email Notifications EF | - | - | No per-email send audit beyond dedup check | Resend API key exposed if env var logging enabled | Bulk email send with no concurrency cap | - |
| C-19: Email Unsubscribe | JWT spoofing if aud/iss claims not validated | Token replay if no jti/nonce check | - | - | - | Unsubscribe action on behalf of another user via crafted JWT |
| C-20: notification-scheduler | - | - | - | - | Email dispatch failure could block push notification pipeline | - |

### Trust Boundaries

| Boundary | Components | Data | Protection |
|----------|-----------|------|------------|
| Client-to-Supabase Auth | C-03/C-04/C-05 <-> Supabase Auth | Credentials (email+password, phone+OTP) | TLS + Supabase Auth SDK |
| Client-to-Supabase DB | C-07/C-15 <-> Supabase DB | user_profiles, user_bookmarks rows | TLS + RLS policies + auth.uid() |
| Client-to-alquran.cloud | C-17 <-> alquran.cloud | Quran page data (read-only) | HTTPS (no auth required) |
| Scheduler-to-Email Function | C-20 <-> C-18 | Participant emails, event data | Service-role key bearer token |
| Email Function-to-Resend | C-18 <-> Resend API | Email content, recipient addresses | TLS + RESEND_API_KEY |
| User-to-Unsubscribe | Browser <-> C-19 | Signed JWT with participant ID | JWT signature verification |
| MMKV local storage | C-15/C-16 <-> Device filesystem | Bookmark queue, reader settings | Device-level only (no encryption) |

### Attack Surface

- Entry points: Auth screens (email+password, phone+OTP), Quran reader page URL params, email-notifications Edge Function POST endpoint, email-unsubscribe GET endpoint with JWT query param, bookmark CRUD via Supabase client
- Data stores: Supabase user_profiles table, Supabase user_bookmarks table, Supabase khatm_participants table (email columns), MMKV local storage (reader settings, pending bookmark ops, auth session), TanStack Query in-memory cache
- External integrations: alquran.cloud API (Quran text), Resend API (email delivery), Supabase Auth (authentication), Expo push notification service (existing)
- Admin interfaces: Supabase Dashboard (database admin), Resend Dashboard (email management), no in-app admin interface

### Injected Criteria

1. [threat-model] WHEN the user signs out THE SYSTEM SHALL clear the AuthStore session and profile state, invalidate all TanStack Query caches, and clear any pending bookmark operations from MMKV to prevent stale session data reuse (CRITICAL)
2. [threat-model] WHEN the email-unsubscribe Edge Function receives a JWT THE SYSTEM SHALL validate the `iss` and `aud` claims match the application's Supabase project before processing the unsubscribe request (CRITICAL)
3. [threat-model] THE SYSTEM SHALL return a generic message on signup for both new and existing email addresses to prevent email enumeration, OR THE SYSTEM SHALL implement a confirmation-first flow where account existence is not revealed until email is verified (HIGH)
4. [threat-model] WHEN the useBookmarks hook replays pending offline bookmark operations from MMKV THE SYSTEM SHALL verify the current authenticated user ID matches the user_id in each queued operation and discard mismatched entries (HIGH)
5. [threat-model] WHEN the Quran API client makes a fetch request to alquran.cloud THE SYSTEM SHALL enforce a 10-second request timeout using AbortController to prevent hung connections (HIGH)
6. [threat-model] WHEN the QuranReaderPage receives a page parameter from the URL THE SYSTEM SHALL validate it is an integer between 1 and 604 and redirect to page 1 if invalid (HIGH)
7. [threat-model] WHEN five consecutive failed login attempts occur for the same email within 15 minutes THE SYSTEM SHALL display a message indicating temporary lockout and reject further attempts until the window expires (enforced by Supabase Auth rate limits or client-side throttle) (MEDIUM)
8. [threat-model] THE SYSTEM SHALL limit the bookmarks list query to a maximum of 200 results to prevent unbounded memory consumption on the client (MEDIUM)
9. [threat-model] WHEN the notification-scheduler invokes the email-notifications Edge Function and the call fails THE SYSTEM SHALL NOT block or delay the existing push notification pipeline (MEDIUM)
10. [threat-model] WHEN a Supabase Auth login attempt fails THE SYSTEM SHALL log the failure event type and timestamp to the client-side console (non-PII) for debugging, and the email-notifications Edge Function SHALL log all send failures with event type and participant_id to khatm_audit_log for non-repudiation (MEDIUM)
