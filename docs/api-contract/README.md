# Proposed API contract: Khatm feature → hikkmah-backend

**Status: PROPOSAL — not yet reviewed by the backend owner (Zia).**
**Backend owner: start at [`../ZIA-HANDOFF.md`](../ZIA-HANDOFF.md)** — it has
the review procedure, the three open decisions with defaults, and the
promotion steps. This README covers the collection itself.
This folder lives in the Iqra-Khatm repo on purpose: it is a reviewable
artifact, not a change to the shared `api-bruno` collection. Once approved,
moving it into `api-bruno` is a copy-paste PR (the folder is a valid Bruno
collection — open it directly in Bruno; `environments/staging.bru` points at
`staging-api.hikkmah.com`).

Every endpoint here is transcribed from the actual Supabase operations the
Iqra-Khatm client performs today (12 files touch the Supabase client — see
`docs/HIKMAH-INTEGRATION.md` §4.2) and from the RLS policies in
`supabase/migrations/001_khatm_schema.sql` + `005_auth_reader_email.sql`.
Each `.bru` file's `docs` block states its **authorization rule** — these are
the RLS policies translated to endpoint terms, and they are the security
contract, not suggestions.

## Conventions for implementers

- **Logging**: use `src/utils/logger.ts` (Pino) in hikkmah-backend — no
  `console.log` in new endpoint code.
- **Identity is server-side.** Endpoints never accept the caller's own
  `participant_id` in a request body for self-actions (claim, progress,
  join). The backend derives the participant row from the authenticated user
  + group. This preserves security-audit fixes SA-003/SA-007 — accepting
  client-supplied identity here reintroduces an impersonation bug.
- **Auth**: all endpoints Bearer-authenticated with Hikmah session tokens,
  except the public unsubscribe endpoint and the internal dispatch job.
- **Audit log**: mutations write `khatm_audit_log`-equivalent rows as noted
  per endpoint. The notification dedup queries read this log — the
  `(participant, event-type, day)` email key and `(assignment, day)` push key
  must survive the port.
- **Errors**: `409` where the client currently branches on Postgres `23505`
  (duplicate claim/assign, already-a-member); `403` where an RLS policy would
  have filtered the row; `404` only for rows the caller could otherwise see.

## Authorization vocabulary (from RLS)

| Term | Meaning (from migration 001 helpers) |
|---|---|
| *member* | caller has a JOINED `khatm_participants` row in the group (`my_participant(group_id)`) |
| *admin* | caller's participant role is ADMIN (`is_admin`) |
| *admin/co-admin* | role is ADMIN or CO_ADMIN (`is_admin_or_coadmin`) |

## What is deliberately NOT in this collection

- **Auth endpoints** (signup, login, phone OTP, password reset, refresh,
  sign-out-all-sessions). The app currently uses Supabase Auth; the port
  maps these onto Hikmah's existing auth. Requirements the mapping must
  cover: email/password signup + login, E.164 phone OTP send/verify with
  resend, password reset that answers uniformly whether or not the email
  exists (enumeration prevention), persistent + refreshable sessions, and
  global sign-out.
- **Realtime** as a concrete transport. `events.bru` documents what the
  client consumes today (per-group assignment changes + group-completion)
  and proposes SSE, with polling as an accepted v1 fallback — Zia's call.
- **Quran text** — stays on alquran.cloud, no backend involvement.

## Files

```
khatm/        groups list/create/dashboard/settings/join, invite code,
              reminder schedules, new cycle, assign/claim/progress/role, events
profile/      display-name profile (onboarding)
bookmarks/    reader bookmarks (drives the offline queue replay)
notifications/  internal daily dispatch job + public email unsubscribe
```
