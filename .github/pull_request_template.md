## What & why

<!-- One or two sentences: what changes, and what problem it solves. -->

## Checklist

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npx jest --ci` — all tests pass (new behavior has test coverage)
- [ ] No secrets in the diff (keys, tokens, `.env` contents)
- [ ] DB changes are additive migrations in `supabase/migrations/` (numbered, in order)
- [ ] Edge-function changes: `_shared/jwt.ts` remains the only JWT sign/verify source
- [ ] Docs updated if behavior/setup changed (`README.md`, `docs/HIKMAH-INTEGRATION.md`)

## Notes for reviewer

<!-- Anything non-obvious: tradeoffs, follow-ups, testing steps on device. -->
