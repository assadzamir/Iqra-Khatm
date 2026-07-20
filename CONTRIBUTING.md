# Contributing

## Setup

```bash
nvm use                       # Node 20.19.4 — required; newer majors fail engine checks
yarn install
cp .env.example .env          # fill in Supabase project values
yarn start
```

New here? Read [docs/HIKMAH-INTEGRATION.md](docs/HIKMAH-INTEGRATION.md) first —
it covers the architecture, the invariants you must not break, and the known
caveats.

## Quality gates

Both must be green before merging (CI enforces them on every PR):

```bash
npx tsc --noEmit    # 0 errors
npx jest --ci       # all suites pass (99 tests at time of writing)
```

Notes:
- `yarn test` runs `jest --watchAll` for local development — it never exits, so
  don't use it in scripts or CI.
- `supabase/functions/**` is excluded from `tsconfig.json` on purpose (Deno
  runtime, URL imports). Don't "fix" the exclusion; edge functions are checked
  at deploy time.
- There is no ESLint config yet. If you add one, prefer the Hikmah project's
  shared config.

## Conventions

- **Commits**: conventional prefixes as used in history — `fix:`, `feat:`,
  `docs:`, `chore:` — with a body that explains *why*. The git log doubles as
  the change narrative; keep it that way.
- **Branches**: branch from `main`, PR back into `main`. Keep `main` green.
- **Database**: additive numbered migrations only (`006_...` next). Never edit
  a merged migration; RLS policies accompany every new table.
- **Page bounds**: use `TOTAL_QURAN_PAGES` / `isValidQuranPage` from
  `src/features/quran-reader/types.ts` — no literal `604`s.
- **Unsubscribe JWTs**: sign/verify only through
  `supabase/functions/_shared/jwt.ts`.

## Secrets

Never commit `.env`, API keys, or Supabase service-role keys. `.env` is
gitignored; edge-function secrets are set via `supabase secrets set`. If a
secret ever lands in a commit, rotate it immediately — force-pushing does not
un-leak it.
