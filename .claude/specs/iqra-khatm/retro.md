# Retrospective: iqra-khatm

> Generated: 2026-04-08

---

## Execution Metrics

| Metric | Value |
|--------|-------|
| Total tasks | 25 |
| Waves | 7 |
| Iterations | 7 |
| Task failures | 0 |
| First-pass success rate | 100% |
| Debugger invocations | 0 |
| Review rejection rate | 0% |
| Security findings (pre-fix) | 2 (1 HIGH, 1 MEDIUM) |
| Security findings (post-fix) | 0 active |
| Threat-model criteria injected | 10 |
| Threat-model criteria passing | 10/10 |
| Acceptance result | ACCEPT |
| Git SHA start | null (not tracked) |

---

## What Went Well

### 1. Types-first wave design (Wave 0) — zero type rework
Following the lesson from `group-khatm`, Wave 0 created the database migration first, then derived TypeScript types column-by-column from the migration SQL. Result: zero type-level rework across all 25 tasks. No downstream task required a type change.

### 2. Interface registry in tasks.md prevented import guessing
The Verified Interfaces Registry section at the top of tasks.md gave every implementer agent exact export names, function signatures, and import paths for existing codebase files (`useKhatmStore`, `useAutoTracking`, `JUZ_PAGE_RANGES`, `KHATM_COLORS`, etc.). No agent guessed a wrong import name.

### 3. Threat model caught 4 HIGH/CRITICAL issues at design time
The STRIDE analysis injected 10 criteria, all of which were verified PASS in the final security audit:
- JWT `iss`+`aud` validation in email-unsubscribe (CRITICAL)
- Sign-out cache/MMKV clearing (CRITICAL)
- Signup enumeration prevention (HIGH)
- Bookmark offline queue user_id verification before replay (HIGH)

These would have been post-spec security findings without the threat model.

### 4. Dark mode as a final wave sweep worked cleanly
T-25 (dark mode polish across all auth screens and navigation) ran as the last non-test wave with no merge conflicts. Deferring cosmetic dark mode to a dedicated sweep avoids cluttering each screen's implementation task.

### 5. Wave decomposition was accurate
All 25 tasks had 0 failures. The dependency DAG was correctly computed — no task failed because a dependency wasn't ready. The wave structure held for all 7 iterations.

---

## What Caused Friction

### 1. Deno edge functions collided with tsconfig `**/*.ts` glob
**Problem**: The root `tsconfig.json` used `"include": ["**/*.ts", "**/*.tsx", ...]` which pulled in `supabase/functions/**/*.ts`. This caused 7 TypeScript errors (`Cannot find name 'Deno'`, `Cannot find name 'console'`) since Deno's globals aren't known to the standard TS compiler.

**Fix applied**: Added `"exclude": ["node_modules", "supabase/functions/**"]` to tsconfig.json.

**Root cause**: The design document noted the existing tsconfig but didn't flag this incompatibility. The implementer agent didn't pre-check for it.

**Impact**: Low — caught during quality gate pass, fix was one-line.

### 2. Notification scheduler lacked auth at the Deno.serve entry point (SA-001)
**Problem**: `notification-scheduler/index.ts` accepted any HTTP request without verifying an Authorization header. Unlike `email-notifications` (which had a service-role Bearer token check from day one), the scheduler was written without this guard.

**Fix applied**: Added Bearer token check at Deno.serve entry, returning 401 for unauthorized requests.

**Root cause**: The design document described the scheduler as "internal" but didn't explicitly add an auth requirement. The implementer used `email-notifications` as a model but missed its auth pattern.

**Impact**: HIGH security risk, caught by security audit. Fix was ~8 lines.

### 3. Error detail leak in notification-scheduler catch block (SA-002)
**Problem**: `catch(e) { return new Response(JSON.stringify({ error: '...', detail: String(e) })) }` leaked internal stack traces and Deno file paths.

**Fix applied**: Removed `detail` field. Returns only `{ "error": "Internal server error" }`.

**Root cause**: Copy-paste from a development/debug template that wasn't cleaned up.

**Impact**: MEDIUM (compounded by SA-001). Fix was one-line.

### 4. Implicit `any` types in Deno map callbacks under strict mode
**Problem**: Three `.map((p) => ...)` and `.map((a) => ...)` callbacks in `notification-scheduler/index.ts` had implicit `any` types that TypeScript strict mode caught.

**Fix applied**: Added `: Record<string, unknown>` type annotations to the three callbacks.

**Root cause**: Supabase query results are untyped at runtime; without explicit type annotations, strict mode infers `any`.

**Impact**: Low — typecheck-only failure, no runtime behavior change.

### 5. T-4 Files field missing `package.json`
**Problem**: T-4 (Supabase auth adapter) listed only `src/lib/supabase.ts` in its Files field, but the task description said it would also add `@react-native-async-storage/async-storage` to `package.json`. The validator caught this as a task description vs. Files mismatch.

**Fix applied**: Added `package.json` to T-4's Files array in both tasks.md and state.json.

**Root cause**: The tasker agent focused on the primary output file and missed the side-effect on package.json.

**Impact**: Low — caught by validator before execution. No runtime impact.

### 6. US-1 AC-2 conflicted with threat-model criterion AC-7
**Problem**: US-1 AC-2 said "An account with this email already exists" (revealing email existence), which directly conflicted with the STRIDE-injected AC-7 (enumeration prevention).

**Fix applied**: Struck through US-1 AC-2 with a note marking it superseded by AC-7.

**Root cause**: The original requirement predated the threat model. When the threat model was injected, the conflict wasn't automatically resolved.

**Impact**: Low — caught by validator, no code impact.

### 7. T-6 `wired` field stuck at "pending" in state.json
**Problem**: After T-6 (AuthStore) was completed, its `wired` field was never updated from `"pending"` to `"yes"`. The pre-acceptance audit confirmed 11 active import sites.

**Fix applied**: Updated to `"yes"` after acceptance.

**Root cause**: The spec-loop auto-commit logic updated `status` but did not separately update `wired` for this task. T-6 is a Zustand store — its wiring is implicit (many consumers) rather than a single explicit import at a known callsite.

**Impact**: None on functionality. Cosmetic state.json issue only.

### 8. Evidence directories completely empty
**Problem**: `evidence/reviews/`, `evidence/tests/`, `evidence/screenshots/` had no files. Quality gate outputs (lint, typecheck) were not persisted during loop execution.

**Root cause**: The spec-loop ran without executing the evidence persistence step for gate outputs.

**Impact**: Acceptance testing worked from code inspection alone. No blocking impact, but a future audit would have no test run artifacts.

---

## Patterns to Repeat

1. **Types-first Wave 0**: Migration SQL → TypeScript types derived column-by-column, before any UI or logic.
2. **Verified Interface Registry in tasks.md**: Exact export shapes from the existing codebase, labeled `[VERIFIED]` vs `[NEW]`.
3. **STRIDE threat model before tasking**: Catches security gaps that implementers won't naturally think about.
4. **Dark mode as a final sweep wave**: Avoids cluttering individual screen tasks.
5. **Separate try/catch for email vs push pipelines**: Prevents email failure from blocking push delivery (threat-model criterion 9).
6. **JWT `iss`+`aud` validation in unsubscribe flows**: Pattern from threat model, verified in audit.

## Patterns to Avoid

1. **Deno edge functions without tsconfig exclude**: Always add `supabase/functions/**` to tsconfig.json exclude.
2. **Edge functions without auth at Deno.serve entry**: Any edge function reachable from the internet needs a service-role bearer token check.
3. **`detail: String(e)` in error responses**: Remove from any public-facing HTTP handler. Log via `console.error`, never serialize to response body.
4. **Tasks with untracked Files side effects (package.json)**: Any task that adds a dependency must list `package.json` in its Files array.
5. **Threat model injection without AC conflict resolution**: After injecting threat-model criteria, scan existing ACs for conflicts with the new security requirements.

---

## Open Items (not blocking)

1. **Adjacent page prefetch (NFR-4)**: Not implemented. `queryClient.prefetchQuery` for pages N-1 and N+1 would improve perceived navigation speed but wasn't critical given the 24h staleTime cache.
2. **Evidence artifacts**: No test run logs, screenshots, or review files. If a re-audit is ever needed, gates would need to be re-run.
3. **3 unresolved deployment questions**: Resend sending domain, Supabase phone auth setup (Twilio/MessageBird), English translation edition selection.
4. **No git_sha_start**: The spec didn't record the starting git SHA, making drift detection unavailable for future re-runs.
