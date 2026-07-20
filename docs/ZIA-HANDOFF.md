# Backend-owner handoff (Zia) — Khatm feature port

This is a **one-shot handoff**: assume no follow-up conversation is possible.
Everything you need to review, decide, and act is in this repo. Where a
decision is yours, a **default** is stated — if you do nothing beyond
approving, the default is what the mobile side will build against.

**Your feedback channel is git, not chat**: annotate `.bru` files directly,
and open issues on this repo for anything blocking — the mobile engineer
watches it. **Whatever version of the contract you merge into `api-bruno`
is the source of truth**; the mobile client will be built against exactly
that, so express your decisions by editing before you merge.

---

## 1. What you're reviewing

`docs/api-contract/` — a valid Bruno collection (open the folder in Bruno;
`environments/staging.bru` targets `staging-api.hikkmah.com`). 18 endpoints
transcribed from what the mobile client actually does against Supabase today.
Each `.bru` file's `docs` block carries:

- its **authorization rule** (translated from our Postgres RLS policies — the
  full DDL is in `supabase/migrations/001_khatm_schema.sql` and
  `005_auth_reader_email.sql`, including the `my_participant` / `is_admin` /
  `is_admin_or_coadmin` helper definitions)
- error shapes the client branches on (409s, the profile 404-means-onboard
  contract)
- invariants that are **security-audit fixes** — the two that must survive
  any redesign:
  - `claim-juz.bru` and `start-new-cycle.bru` derive the caller's identity
    server-side and never accept a participant id from the client (SA-003 /
    SA-007 — accepting one reintroduces an impersonation bug)
  - the notification dedup keys: push `(assignment_id, day)`, email
    `(participant_id, event_type, day)`

Rename paths, reshape payloads, split endpoints — all fine. The
authorization rules and the two invariants above are the parts that are
security contract rather than style.

## 2. Review procedure

1. Read `docs/api-contract/README.md` (conventions — including using
   `src/utils/logger.ts` (Pino) in new endpoint code, not `console.log`).
2. Go file by file; edit anything you disagree with **in the file itself**
   (payloads, paths, notes in the `docs` block).
3. Resolve the three decisions below (or accept the defaults).
4. Promote to `api-bruno` (§4). The merged PR **is** the approval signal —
   no other sign-off is needed or expected.

## 3. The three decisions (with defaults)

### D1 — Realtime transport (`khatm/events.bru`)

The client needs, per open group dashboard: a "something changed" signal, a
"group completed" signal, and connection state. Proposed: SSE.

**Default if you'd rather not build realtime now: polling.** Delete
`events.bru` before merging — the mobile client will interpret its absence
as "poll the dashboard endpoint" (TanStack Query refetchInterval; the screen
already tolerates 10s staleness). Nothing else changes.

### D2 — Auth mapping (no auth endpoints are drafted on purpose)

The app currently uses Supabase Auth. Requirements to map onto Hikmah's
existing auth: email/password signup + login, password reset with uniform
response (enumeration prevention), refreshable persistent sessions, global
sign-out, and phone OTP (E.164, resend cooldown).

**Default: document the mapping in `api-bruno`** (which existing Hikmah auth
endpoints serve each flow). If Hikmah auth has no phone OTP, **drop phone
OTP from v1** — the OTP screen is removed on the mobile side; don't build
SMS infrastructure just for parity.

### D3 — Unsubscribe semantics (`notifications/email-unsubscribe.bru`)

Today the flag is per group-membership (`khatm_participants` row), but the
email copy implies a global unsubscribe — a user in 3 groups keeps getting
email from the other 2.

**Default: make it global per-user.** Token `sub` becomes the user id, the
preference moves to the user profile, the dispatch job checks it. If you
keep per-group instead, note it in the `.bru` file and the mobile side will
fix the email copy to say "for this group".

## 4. Promotion into api-bruno (you own this step)

```bash
git clone https://github.com/hikkmah-organization/Iqra-Khatm
git clone https://github.com/hikkmah-organization/api-bruno
cd api-bruno && git checkout -b khatm-api-contract
cp -r ../Iqra-Khatm/docs/api-contract ./khatm     # adjust to your layout
# drop our bruno.json/environments if the collection already has its own
git add . && git commit -m "feat: khatm feature API contract"
git push -u origin khatm-api-contract              # merge per your process
```

## 5. Implementation reference (for whoever builds the endpoints)

- **Schema**: `supabase/migrations/001-005` is the authoritative DDL — 8
  tables, CHECK constraints, triggers (juz status transitions, group
  completion detection, self-role-change prevention). Trigger logic moves
  into endpoints or your own triggers; semantics are described in
  `record-progress.bru` and `change-participant-role.bru`.
- **Jobs**: the daily notification job's full semantics (3 scenarios,
  channels, dedup, per-recipient payloads) are in
  `dispatch-daily-notifications.bru`. The Resend integration is portable
  as-is from `supabase/functions/email-notifications/index.ts` — but note
  the sender address and the `iqra-khatm://khatm` deep link are hardcoded
  there and must become Hikmah values.
- **Unsubscribe JWT**: `supabase/functions/_shared/jwt.ts` is the current
  sign/verify module — keep signer and verifier in one module in the port.
- **Wider context**: `docs/HIKMAH-INTEGRATION.md` (§4 is the port plan);
  security audit + threat model in `.claude/specs/iqra-khatm/evidence/` —
  the RLS→API-authorization move warrants a re-review against that threat
  model once endpoints exist.

## 6. What happens on the mobile side meanwhile

Rebranding, route mounting, and theming proceed immediately (they don't
depend on you). The data-layer swap starts **from whatever you merge into
api-bruno** — that merge is the green light, and the contract as merged is
what gets built. If nothing is merged, nothing is swapped and the feature
keeps running on its interim Supabase backend (deploy docs in
`HIKMAH-INTEGRATION.md` §5).
