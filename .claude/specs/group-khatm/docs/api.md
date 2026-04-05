# Group Khatm — API Reference

All public exports are available from the barrel at `src/features/khatm/index.ts`.

```typescript
import { useKhatmStore, useKhatmGroups, useKhatmScreen, useCreateKhatm } from '@/features/khatm';
import type { KhatmGroup, KhatmScreenData } from '@/features/khatm';
```

Using a relative path also works: `import { ... } from '../features/khatm'`.

---

## Query Hooks

### `khatmKeys`

Query key factory. Use when manually invalidating queries.

```typescript
export const khatmKeys = {
  all: ['khatm'] as const,
  groups: () => [...khatmKeys.all, 'groups'] as const,
  screen: (groupId: string) => [...khatmKeys.all, 'screen', groupId] as const,
};
```

---

### `useKhatmGroups(): UseQueryResult<KhatmGroupCard[]>`

Returns all Khatm groups where the current user is a JOINED participant.

**Return type:**
```typescript
interface KhatmGroupCard {
  group_id: string;
  title: string;
  role: ParticipantRole;
  completed_count: number;   // completed Juz out of 30
  member_count: number;      // JOINED participants
  start_date: string;        // ISO date
  end_date: string;          // ISO date
  status: GroupStatus;
}
```

**staleTime:** 30 seconds.

**When to use:** Home dashboard list of groups. Not suitable for the group detail screen — use `useKhatmScreen` instead.

**Implementation note:** Makes 2N + 1 Supabase requests (one for participation list, then 2 count queries per group). For large group lists this is inefficient; a future RPC consolidation is tracked.

---

### `useKhatmScreen(groupId: string): UseQueryResult<KhatmScreenData>`

Returns full group dashboard data in a single Supabase select with nested relations.

**Parameters:**
- `groupId` — UUID of the group; query is disabled when falsy

**Return type:**
```typescript
type KhatmScreenData = {
  group: KhatmGroup;
  participants: KhatmParticipant[];
  juz_tiles: JuzTileData[];       // always exactly 30 items
  my_participant: KhatmParticipant | null;
  completed_count: number;        // 0–30
};
```

**staleTime:** 10 seconds. Invalidated by `useKhatmRealtime` on any `khatm_juz_assignments` or `khatm_groups` change.

**When to use:** `GroupKhatmScreen` as the primary data source.

**Juz tile construction logic:** A tile's `display_status` is `'open'` when no assignment rows exist for that Juz number. Otherwise: `'completed'` if any assignment has `status = 'COMPLETED'`, `'in_progress'` if any has `status = 'IN_PROGRESS'`, `'assigned'` otherwise.

---

### `useKhatmRealtime(groupId: string, onGroupCompleted?: (groupId: string) => void): { connected: React.MutableRefObject<boolean> }`

Subscribes to Supabase Realtime `postgres_changes` on two tables:

- `khatm_juz_assignments` (filter: `group_id=eq.${groupId}`) — any event → invalidates `khatmKeys.screen(groupId)`
- `khatm_groups` (filter: `id=eq.${groupId}`) — UPDATE only → if `status === 'COMPLETED'`, calls `onGroupCompleted`; also invalidates screen query

**Return value:** `connected` is a `MutableRefObject<boolean>` that is `true` when the channel status is `'SUBSCRIBED'` and `false` on `CHANNEL_ERROR` or `TIMED_OUT`. Read this ref to show a "Reconnecting..." UI indicator.

**When to use:** Mount once per `GroupKhatmScreen` instance. Pass `onGroupCompleted` to navigate to `CompletionScreen`.

---

## Mutation Hooks

All mutation hooks return `UseMutationResult` from TanStack Query. On success, each hook invalidates the relevant query keys.

---

### `useCreateKhatm(): UseMutationResult<KhatmGroup, Error, CreateKhatmInput>`

Creates a new Khatm group in 4 sequential steps:
1. Calls `generate_invite_code()` RPC
2. Inserts `khatm_groups` row
3. Inserts creator as `ADMIN` participant
4. Inserts `khatm_reminder_schedules` rows for each `reminder_windows` value

**Input type:**
```typescript
type CreateKhatmInput = {
  title: string;                       // max 80 chars, required
  intention?: string;
  occasion_type: OccasionType;
  dedicated_to_name?: string;
  dedicated_to_relationship?: string;
  start_date: string;                  // ISO date YYYY-MM-DD
  end_date: string;                    // ISO date YYYY-MM-DD
  timezone: string;                    // IANA timezone
  language: GroupLanguage;
  assignment_mode: AssignmentMode;
  max_per_juz: number;                 // 1 or 2 in v1
  allow_juz_switch: boolean;
  reminder_windows: number[];          // days_before values, e.g. [5, 2, 1]
};
```

**Error cases:**
- `'Not authenticated'` — no Supabase user session
- `'Could not create group. Please try again.'` — RPC failure, group insert failure, participant insert failure, or schedule insert failure

**Note:** Operations are not wrapped in a transaction. Partial failure can leave orphaned rows (SA-013). On invalidation: refreshes `khatmKeys.groups()`.

---

### `useAssignJuz(): UseMutationResult<KhatmJuzAssignment, Error, AssignJuzInput>`

Admin/co-admin assigns a Juz to a participant. Inserts a `khatm_juz_assignments` row and an audit log entry with `action_type: 'JUZ_ASSIGNED'`.

**Input type:**
```typescript
interface AssignJuzInput {
  group_id: string;
  participant_id: string;
  juz_number: number;       // 1–30
  assigned_by: string;      // actor's participant_id
  notify: boolean;          // UI flag; notification sending not yet wired
}
```

**Error cases:**
- `'This Juz already has the maximum number of assignees.'` — Postgres error code `23505` (unique constraint violation)
- `'Failed to assign Juz. Please try again.'` — other Supabase errors

On invalidation: refreshes `khatmKeys.screen(group_id)`.

---

### `useClaimJuz(): UseMutationResult<KhatmJuzAssignment, Error, ClaimJuzInput>`

Participant self-claim via `claim_juz(p_group_id, p_juz_number)` RPC. The RPC derives `participant_id` from `auth.uid()` server-side — the client never supplies it.

**Input type:**
```typescript
interface ClaimJuzInput {
  group_id: string;
  juz_number: number;   // 1–30
}
```

**Error cases:**
- `'This Juz already has the maximum number of assignees.'` — RPC raises `23505` or message includes `'fully assigned'`
- `'Failed to claim Juz. Please try again.'` — other errors (including non-PARTICIPANT mode, inactive member, etc.)

On invalidation: refreshes `khatmKeys.screen(group_id)`.

---

### `useUpdateProgress(): UseMutationResult<void, Error, UpdateProgressInput>`

Writes a `khatm_progress_updates` ledger entry then updates `khatm_juz_assignments.progress_percent`. The `update_juz_last_updated` database trigger handles `started_at`, `completed_at`, `status`, and `last_updated_at` automatically.

**Input type:**
```typescript
interface UpdateProgressInput {
  assignment_id: string;
  group_id: string;
  participant_id: string;
  progress_percent: number;    // 0–100
  previous_percent: number;
  source: ProgressSource;      // 'IN_APP' | 'AUTO_TRACKING' | 'ADMIN_OVERRIDE'
  note?: string;
}
```

**Error cases:**
- `'Failed to save progress. Please try again.'` — progress insert or assignment update failed

**Note:** Admin override writes (`source: 'ADMIN_OVERRIDE'`) set `participant_id` to the target participant, which causes the `khatm_progress_updates` INSERT RLS policy to silently reject the write (SA-014).

On invalidation: refreshes `khatmKeys.screen(group_id)`.

---

### `useAssignRole(): UseMutationResult<void, Error, AssignRoleInput>`

Promotes or demotes a participant. Checks that the target is JOINED before updating. If demoting a co-admin with `keep_records: false`, re-attributes all `ADMIN_OVERRIDE` progress updates to the admin's `participant_id`.

**Input type:**
```typescript
interface AssignRoleInput {
  participant_id: string;
  group_id: string;
  new_role: ParticipantRole;
  keep_records?: boolean;          // only relevant when demoting CO_ADMIN
  admin_participant_id: string;    // actor's participant_id (for audit log)
}
```

**Error cases:**
- `'Participant not found.'` — fetch failed
- `'Cannot promote inactive members.'` — `status !== 'JOINED'`
- `'Failed to update role. Please try again.'` — update failed

On invalidation: refreshes `khatmKeys.screen(group_id)`.

---

### `useJoinKhatm(): UseMutationResult<{ groupId: string }, Error, { invite_code: string; name: string }>`

Joins a Khatm by invite code. Upcases the code before lookup. If the caller is already a member, returns `{ groupId }` without creating a duplicate row. Writes a `MEMBER_JOINED` audit log entry on new joins.

**Error cases:**
- `'Not authenticated'`
- `'Invalid code. Please check and try again.'` — no matching group found
- `'You are already a member of this Khatm.'` — Postgres `23505` on the unique constraint
- `'Failed to join. Please try again.'` — other errors

**Note:** The invite code is validated client-side only; any authenticated user can construct a participant insert for any `group_id` (SA-004).

On invalidation: refreshes `khatmKeys.groups()`.

---

### `useStartNewCycle(): UseMutationResult<KhatmGroup, Error, { source_group_id: string }>`

Calls `start_new_cycle(p_source_group_id)` RPC, which atomically creates a new group (`khatm_cycle = N + 1`) and copies all JOINED participants. Server enforces: caller must be ADMIN, source group must be COMPLETED.

**Error cases:**
- `'Failed to start new cycle. Please try again.'` — RPC error (includes unauthorized or non-COMPLETED group)

On invalidation: refreshes `khatmKeys.groups()`.

---

### `useUpdateGroupSettings(): UseMutationResult<void, Error, UpdateGroupSettingsInput>`

Updates group settings, reminder windows, or regenerates the invite code.

**Input type:**
```typescript
interface UpdateGroupSettingsInput {
  group_id: string;
  actor_participant_id: string;
  updates?: Partial<Pick<KhatmGroup, 'assignment_mode' | 'max_per_juz' | 'allow_juz_switch'>>;
  reminder_windows?: number[];      // replaces all existing schedules (soft-delete + re-insert)
  regenerate_invite?: boolean;      // calls generate_invite_code() RPC and updates the group
}
```

**Error cases:**
- `'Failed to save settings. Please try again.'` — group update or schedule insert failed
- `'Failed to regenerate invite code. Please try again.'` — RPC or group update failed

On invalidation: refreshes `khatmKeys.screen(group_id)`.

---

## Store

### `useKhatmStore`

Zustand store backed by MMKV. Import from the barrel or directly from `./store`.

```typescript
import { useKhatmStore } from '@/features/khatm';
```

#### State Fields

| Field | Type | Default | Persisted | Description |
|-------|------|---------|-----------|-------------|
| `activeGroupId` | `string \| null` | `null` | Yes (MMKV) | UUID of the currently open group; survives app restarts |
| `juzGridCollapsed` | `boolean` | `false` | No | Juz grid accordion state; resets on app restart |
| `membersCollapsed` | `boolean` | `true` | No | Members accordion state; resets on app restart |
| `inviteJoinCollapsed` | `boolean` | `true` | No | Invite & Join accordion; set to `false` by `GroupKhatmScreen` when deep link `joinCode` param is present |
| `remindersCollapsed` | `boolean` | `true` | No | Reminders & Settings accordion; resets on app restart |
| `activeReadingContext` | `KhatmReadingContext \| null` | `null` | No | Set on "Start Reading" tap; cleared on Quran reader exit; NOT persisted — crash during reading loses context but DB progress is preserved |

#### Setters

| Setter | Signature |
|--------|-----------|
| `setActiveGroupId` | `(id: string \| null) => void` |
| `setJuzGridCollapsed` | `(collapsed: boolean) => void` |
| `setMembersCollapsed` | `(collapsed: boolean) => void` |
| `setInviteJoinCollapsed` | `(collapsed: boolean) => void` |
| `setRemindersCollapsed` | `(collapsed: boolean) => void` |
| `setActiveReadingContext` | `(ctx: KhatmReadingContext \| null) => void` |

**Persistence config:**
- Store name: `'khatm-store'`
- Storage: `createJSONStorage(() => mmkvStorage)` (uses existing `@/lib/mmkv` adapter)
- `partialize` persists only `{ activeGroupId }` — all other fields are excluded

---

## Auto-Tracking

### `useAutoTracking(params): void`

Tracks Quran reader page progress and writes to `khatm_progress_updates` automatically.

```typescript
useAutoTracking(params: {
  khatmContext: KhatmReadingContext;
  currentPage: number;
  assignmentId: string;          // khatm_juz_assignments.id — must be looked up before calling
}): void
```

**Throttle behavior:** A progress write fires when `|currentPage - lastWrittenPage| >= 2` OR when `currentPage >= khatmContext.endPage`. A final write fires on component unmount (reader exit). All writes use `source: 'AUTO_TRACKING'`.

**Progress formula:**
```typescript
Math.min(100, Math.max(0, Math.round(((currentPage - startPage + 1) / (endPage - startPage + 1)) * 100)))
```

**MMKV failure queue:** Failed writes are queued under MMKV key `'khatm-pending-progress'` as `PendingProgressItem[]`. The queue is flushed at the start of every subsequent write attempt. This provides durability across network interruptions.

**Note:** The security audit (SA-009) flagged an earlier version of this hook that used in-memory `globalThis` for the queue. The current implementation at `src/features/khatm/hooks/useAutoTracking.ts` uses MMKV (`readPendingQueue` / `writePendingQueue` helper functions).

**Call site guard:** This hook must only be called when `khatmContext` is present. Use an outer `if` check — do not call conditionally inside the component body:

```tsx
// In src/app/(quran-reader)/[page].tsx
const khatmContext = route.params?.khatmContext;

// Correct: guard in the parent, call hook unconditionally inside child
function KhatmTracker({ khatmContext, currentPage, assignmentId }) {
  useAutoTracking({ khatmContext, currentPage, assignmentId });
  return null;
}

// In parent component:
{khatmContext && <KhatmTracker khatmContext={khatmContext} currentPage={currentPage} assignmentId={assignmentId} />}
```

**On unmount:** Writes final progress if `currentPage > lastWrittenPage`, then calls `setActiveReadingContext(null)`.

---

## Key Types

### `KhatmGroup`

Full group row as returned from Postgres.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | UUID |
| `title` | `string` | max 80 chars |
| `intention` | `string \| null` | Free-text niyyah |
| `occasion_type` | `OccasionType` | `'GENERAL' \| 'MEMORIAL' \| 'RAMADAN' \| 'EID' \| 'SHIFA' \| 'CUSTOM'` |
| `dedicated_to_name` | `string \| null` | Used on completion screen for MEMORIAL |
| `dedicated_to_relationship` | `string \| null` | |
| `start_date` | `string` | ISO date `YYYY-MM-DD` |
| `end_date` | `string` | ISO date `YYYY-MM-DD` |
| `timezone` | `string` | IANA timezone |
| `language` | `GroupLanguage` | `'AR' \| 'EN' \| 'UR' \| 'TR' \| 'FR' \| 'ID' \| 'MS'` |
| `assignment_mode` | `AssignmentMode` | `'ADMIN' \| 'PARTICIPANT'` |
| `max_per_juz` | `number` | `smallint`, default 1, v1 max 2 |
| `allow_juz_switch` | `boolean` | |
| `invite_code` | `string` | 8-char alphanumeric |
| `status` | `GroupStatus` | `'ACTIVE' \| 'COMPLETED' \| 'ARCHIVED'` |
| `admin_user_id` | `string` | `auth.users.id` |
| `khatm_cycle` | `number` | Incremented by `start_new_cycle` RPC |
| `created_at` | `string` | ISO timestamp |
| `completed_at` | `string \| null` | Set by `check_group_completion` trigger |

### `KhatmParticipant`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | UUID, used as `participant_id` FK |
| `group_id` | `string` | |
| `user_id` | `string \| null` | null for non-app users who haven't joined yet |
| `name` | `string` | Display name |
| `contact_type` | `string` | `'PHONE' \| 'EMAIL'` |
| `contact_value` | `string` | |
| `role` | `ParticipantRole` | `'ADMIN' \| 'CO_ADMIN' \| 'PARTICIPANT'` |
| `status` | `ParticipantStatus` | `'INVITED' \| 'JOINED' \| 'REMOVED' \| 'LEFT'` |
| `joined_at` | `string \| null` | |
| `last_active_at` | `string \| null` | |

### `KhatmJuzAssignment`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | UUID |
| `group_id` | `string` | |
| `participant_id` | `string` | FK to `khatm_participants` |
| `juz_number` | `number` | 1–30 |
| `status` | `JuzStatus` | `'ASSIGNED' \| 'IN_PROGRESS' \| 'COMPLETED'` — managed by trigger |
| `progress_percent` | `number` | 0–100 |
| `last_note` | `string \| null` | |
| `assigned_at` | `string` | |
| `started_at` | `string \| null` | Set by trigger when `progress_percent` first `> 0` |
| `completed_at` | `string \| null` | Set by trigger when `progress_percent = 100` |
| `last_updated_at` | `string` | Set by trigger on every update |
| `assigned_by` | `string \| null` | `participant_id` of the assigner |

### `JuzTileData`

Derived type used by `JuzGrid` / `JuzTile`.

| Field | Type | Notes |
|-------|------|-------|
| `juz_number` | `number` | 1–30 |
| `arabic_name` | `string` | From `JUZ_ARABIC_NAMES` constant |
| `assignments` | `JuzTileAssignment[]` | Empty for open tiles |
| `display_status` | `'open' \| 'assigned' \| 'in_progress' \| 'completed'` | `'open'` = no rows; computed by `useKhatmScreen` |

### `KhatmScreenData`

See `useKhatmScreen` return type above.

### `KhatmReadingContext`

Set in the Zustand store by `JuzBottomSheet` when participant taps "Start Reading".

| Field | Type | Notes |
|-------|------|-------|
| `groupId` | `string` | |
| `participantId` | `string` | |
| `juzNumber` | `number` | 1–30 |
| `startPage` | `number` | From `JUZ_PAGE_RANGES[juzNumber].startPage` |
| `endPage` | `number` | From `JUZ_PAGE_RANGES[juzNumber].endPage` |

---

## Constants

### `JUZ_PAGE_RANGES`

```typescript
Record<number, { startPage: number; endPage: number }>
```

Madinah Mushaf page ranges for all 30 Juz (604 pages total). Field names are `startPage` / `endPage` (not `start` / `end`, to avoid collision with JS reserved words).

| Juz | startPage | endPage |
|-----|-----------|---------|
| 1 | 1 | 21 |
| 15 | 282 | 301 |
| 30 | 582 | 604 |

Full table in `src/features/khatm/constants.ts`.

---

### `KHATM_COLORS`

Design tokens from the Iqra staging app (`as const` — all values are literal string types).

| Key | Value | Usage |
|-----|-------|-------|
| `primary` | `'#117A7A'` | Bismillah header, completed tile fill, teal accents |
| `cardBg` | `'#D7F2E582'` | Card backgrounds (light mode) |
| `pageBgLight` | `'#FFFFFF'` | Page background (light mode) |
| `pageBgAlt` | `'#F8FAFB'` | Alternate page background |
| `textPrimary` | `'#222934'` | Primary text |
| `textSecondary` | `'#393D43'` | Secondary text |
| `tealTint` | `'#D7F2E5'` | Assigned tile background |
| `gold` | `'#C8921A'` | Completion screen accents |
| `darkBg` | `'#121212'` | Dark mode page background |
| `darkCard` | `'#2A2A2A82'` | Dark mode card background |

---

### Permission Arrays

All typed as `readonly ParticipantRole[]`.

| Constant | Allowed Roles |
|----------|--------------|
| `CAN_ASSIGN_JUZ` | `['ADMIN', 'CO_ADMIN']` |
| `CAN_REASSIGN_JUZ` | `['ADMIN', 'CO_ADMIN']` |
| `CAN_MANAGE_INVITES` | `['ADMIN', 'CO_ADMIN']` |
| `CAN_RECORD_PROXY_PROGRESS` | `['ADMIN', 'CO_ADMIN']` |
| `CAN_SEND_REMINDERS` | `['ADMIN', 'CO_ADMIN']` |
| `CAN_PROMOTE_COADMIN` | `['ADMIN']` |
| `CAN_DELETE_GROUP` | `['ADMIN']` |

---

### `STALL_THRESHOLDS`

```typescript
{ juz_not_started_days: 3, in_progress_no_update_days: 4 } as const
```

Used by `AdminSummaryCard` to classify assignments as stalled. The Edge Function uses these same thresholds for push notification triggers.

---

### `DEFAULT_REMINDER_WINDOWS`

```typescript
[5, 2, 1] as const
```

Pre-filled in Step 4 of the creation flow. Values are days before `end_date`.

---

### `INVITE_CODE_CHARSET` / `INVITE_CODE_LENGTH`

```typescript
'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  // excludes O, 0, I, 1
8
```

Used by `generate_invite_code()` RPC and in UI validation. The charset deliberately excludes visually ambiguous characters so users can transcribe codes without confusion.
