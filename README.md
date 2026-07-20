# Iqra-Khatm

A group Quran-completion (khatm) app: create a khatm group, assign or claim
Juz, track everyone's progress, and read the Quran page-by-page with automatic
progress tracking. Built to be folded into the **Hikmah** app — see
[docs/HIKMAH-INTEGRATION.md](docs/HIKMAH-INTEGRATION.md) for the integration
handoff.

## Stack

| Layer | Technology |
|---|---|
| App | Expo SDK 54 / React Native 0.81 / React 19, expo-router (file-based routing) |
| State | Zustand (auth + khatm stores), TanStack Query (server state), MMKV (device persistence) |
| Backend | Supabase — Postgres + RLS, Auth (email/password + phone OTP), Realtime, Deno Edge Functions |
| Email | Resend API (via `email-notifications` edge function) |
| Quran text | [alquran.cloud](https://alquran.cloud) REST API (Uthmani script + `en.asad` translation), 24h client cache |
| Tests | Jest (`jest-expo`) + React Native Testing Library — 99 tests across 8 suites |

## Prerequisites

- **Node 20.19.4** — pinned in `.nvmrc` / `.node-version`. Use `nvm use` (or
  fnm/volta). On newer Node (e.g. 23.x) `yarn install` fails engine checks and
  needs `--ignore-engines`; on the pinned version it installs cleanly.
- Yarn 1.x
- Supabase CLI (for migrations and edge-function deploys)
- An Expo dev environment (Expo Go or a dev build; EAS for release builds)

## Setup

```bash
nvm use               # 20.19.4
yarn install
cp .env.example .env  # fill in your Supabase project values
yarn start            # expo start
```

Database (against your Supabase project):

```bash
supabase db push      # runs migrations 001-005 in order
supabase functions deploy notification-scheduler
supabase functions deploy email-notifications
supabase functions deploy email-unsubscribe
supabase secrets set RESEND_API_KEY=re_...
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWT_SECRET` are
provided to edge functions automatically by the Supabase platform.

## Scripts

| Command | What it does |
|---|---|
| `yarn start` | Expo dev server |
| `npx jest --ci` | Run the test suite once (`yarn test` runs `jest --watchAll` and never exits — don't use it in CI) |
| `yarn typecheck` | `tsc --noEmit` — currently 0 errors |
| `yarn lint` | `expo lint` — **no ESLint config exists yet**; first run tries to auto-install eslint@9 (needs the pinned Node) |

## Project structure

```
src/
  app/                    expo-router routes
    (auth)/               login, signup, OTP, forgot-password, onboarding, route guard
    (tabs)/               Home + Khatm tabs (auth-guarded)
    (quran-reader)/       [page].tsx — dynamic reader route, pages 1-604
    _layout.tsx           root layout: QueryClientProvider, auth session listener
  features/
    auth/                 Zustand auth store, UserProfile types
    khatm/                khatm groups: store, queries/mutations, Juz tiles, bottom sheets
    quran-reader/         reader: api client, hooks, components, types (TOTAL_QURAN_PAGES)
  lib/                    supabase client, MMKV storage adapter
supabase/
  migrations/             001-005 (run in order; 005 adds auth/reader/email schema)
  functions/
    notification-scheduler/  daily cron: deadline/stall push + email dispatch
    email-notifications/     Resend email sender (service-role only)
    email-unsubscribe/       JWT-verified one-click unsubscribe
    _shared/jwt.ts           unsubscribe-JWT sign/verify — single source of truth
tests/                    component + e2e suites (jest-expo)
.claude/specs/iqra-khatm/ spec, design, threat model, security audit, release notes
```

## Documentation map

- **[docs/HIKMAH-INTEGRATION.md](docs/HIKMAH-INTEGRATION.md)** — engineer
  handoff: architecture, data model, integration plan, known caveats. Start here.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — setup, quality gates (CI runs
  typecheck + tests on every PR), conventions, secrets policy
- `.claude/specs/iqra-khatm/requirements.md` / `design.md` — full spec (EARS
  acceptance criteria, architecture decisions)
- `.claude/specs/iqra-khatm/release.md` — v1.0.0 release notes, deployment
  checklist, rollback plan
- `.claude/specs/iqra-khatm/evidence/` — security audit (93/100) and STRIDE
  threat model
- `docs/khatm-research-compilation.md` — product research behind the khatm flows
