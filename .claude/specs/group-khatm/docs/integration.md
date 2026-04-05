# Group Khatm — Integration Guide

This guide covers wiring the Group Khatm feature module into the Iqra Expo app shell.

---

## Prerequisites

These packages must be installed before adding Group Khatm:

```bash
npm install @supabase/supabase-js @tanstack/react-query zustand react-native-mmkv \
  @gorhom/bottom-sheet expo-notifications @react-navigation/native-stack \
  @react-native-community/slider react-native-reanimated react-native-gesture-handler
```

The feature also depends on two app-level singletons that must already exist:

| Path | Description |
|------|-------------|
| `src/lib/supabase.ts` | Exports a configured `supabase` client (`createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`) |
| `src/lib/mmkv.ts` | Exports `mmkvStorage` compatible with Zustand's `createJSONStorage` (i.e., `{ getItem, setItem, removeItem }`) |

---

## Step-by-Step Wiring Guide

### 1. Tab Navigator Integration

Add the Khatm stack as a tab in the app's bottom navigator. The `KhatmStackNavigator` exported from the feature module handles its own internal navigation between `GroupKhatmScreen` and `CompletionScreen`.

**`src/app/(tabs)/_layout.tsx`** (example — adapt to your actual navigator):

```tsx
import { Tabs } from 'expo-router'; // or React Navigation Tabs
import { KhatmStackNavigator } from '@/features/khatm';

// Inside your tab navigator:
<Tabs.Screen
  name="khatm"
  component={KhatmStackNavigator}
  options={{ title: 'Khatm', tabBarIcon: ... }}
/>
```

If you use Expo Router file-based routing, create a screen file instead:

**`src/app/(tabs)/khatm.tsx`**:

```tsx
import { KhatmStackNavigator } from '@/features/khatm';

export default function KhatmTab() {
  return <KhatmStackNavigator />;
}
```

The `KhatmStackNavigator` contains two screens:

| Screen name | Component | Params |
|-------------|-----------|--------|
| `GroupKhatm` | `GroupKhatmScreen` | `{ groupId?: string; joinCode?: string }` |
| `Completion` | `CompletionScreen` | `{ groupId: string }` |

Both screens have `headerShown: false`.

---

### 2. Deep Link Configuration

The invite join flow uses the deep link scheme `iqra://khatm/join/:joinCode`. Add this to `app.json`:

```json
{
  "expo": {
    "scheme": "iqra",
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "data": [{ "scheme": "iqra", "host": "khatm", "pathPattern": "/join/.*" }],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

In your root navigation handler, parse the deep link and navigate to the `GroupKhatm` screen with the `joinCode` param:

```typescript
// Example with expo-linking
import * as Linking from 'expo-linking';

Linking.addEventListener('url', ({ url }) => {
  const parsed = Linking.parse(url); // iqra://khatm/join/ABCD1234
  if (parsed.hostname === 'khatm' && parsed.path?.startsWith('/join/')) {
    const joinCode = parsed.path.replace('/join/', '');
    navigation.navigate('GroupKhatm', { joinCode });
  }
});
```

When `GroupKhatmScreen` receives a `joinCode` param, it automatically sets `inviteJoinCollapsed` to `false` in the Zustand store, expanding the Invite & Join accordion so the user sees the join field immediately.

For users without the app installed, the deep link should fall back to an app store redirect page. This requires a universal link / App Link configuration outside this feature's scope.

---

### 3. Quran Reader Integration

Auto-tracking requires the Quran reader screen to call `useAutoTracking` when a `khatmContext` navigation param is present.

**Expected reader file path:** `src/app/(quran-reader)/[page].tsx`

**Status: T-08 `wired: 'pending'`** — this file does not yet exist in the codebase. The `useAutoTracking` hook is implemented and exported but not yet called from the reader.

When the reader is created, add this pattern:

```tsx
import { useAutoTracking, useKhatmStore } from '@/features/khatm';
import type { KhatmReadingContext } from '@/features/khatm';

// In your page-level reader component:
interface QuranReaderProps {
  currentPage: number;
  khatmContext?: KhatmReadingContext;   // passed as navigation param from JuzBottomSheet
  khatmAssignmentId?: string;          // must be resolved before reaching this screen
}

// To avoid calling hooks conditionally, extract into a child component:
function KhatmAutoTracker({
  khatmContext,
  currentPage,
  assignmentId,
}: {
  khatmContext: KhatmReadingContext;
  currentPage: number;
  assignmentId: string;
}) {
  useAutoTracking({ khatmContext, currentPage, assignmentId });
  return null;
}

// In the parent reader component's render:
{khatmContext && khatmAssignmentId && (
  <KhatmAutoTracker
    khatmContext={khatmContext}
    currentPage={currentPage}
    assignmentId={khatmAssignmentId}
  />
)}
```

**The `assignmentId` lookup problem:** `KhatmReadingContext` does not include `assignment_id` (WARN-1 in `state.json`). The reader must look up the assignment ID before calling the hook. The recommended approach is to fetch the active assignment for the `(groupId, juzNumber)` pair from `useKhatmScreen` data or pass it as a separate navigation param from `JuzBottomSheet`:

```typescript
// In JuzBottomSheet, when navigating to the reader:
navigation.navigate('QuranReader', {
  page: JUZ_PAGE_RANGES[juzNumber].startPage,
  khatmContext: activeReadingContext,
  khatmAssignmentId: assignment.assignment_id,  // from JuzTileData.assignments
});
```

The Quran reader must NOT modify any behavior when `khatmContext` is absent (requirement US-5 AC-6).

---

### 4. Push Notification Setup

Push notifications are sent by the `notification-scheduler` Edge Function, not by the client app. The client is only responsible for registering the Expo push token and storing it where the Edge Function can retrieve it.

Register the push token during app startup:

```typescript
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';

async function registerPushToken() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  // Store in user app_metadata (requires Edge Function or service role)
  // OR store in a user_push_tokens table that the Edge Function reads:
  await supabase.from('user_push_tokens').upsert({
    participant_id: '<your-participant-id>',
    push_token: token,
  });
}
```

The Edge Function (`supabase/functions/notification-scheduler/index.ts`) attempts to resolve push tokens in two ways (in order):
1. A `user_push_tokens` table with a `push_token` column keyed by `participant_id`
2. `auth.users.app_metadata.expo_push_token` (requires service role)

Neither table/column is created by the Khatm migrations. You must implement one of these storage strategies independently.

---

### 5. Supabase Migration

Apply all three migrations in order to a new or existing Supabase project:

```bash
supabase db push
```

This applies migrations in filename order:

| Order | File | Contents |
|-------|------|----------|
| 1 | `supabase/migrations/001_khatm_schema.sql` | Full schema, enums, indexes, triggers, RLS |
| 2 | `supabase/migrations/002_security_fixes.sql` | `claim_juz` and `start_new_cycle` RPCs, self-update policy |
| 3 | `supabase/migrations/003_acceptance_fixes.sql` | Audit log INSERT policy, role escalation trigger |

For a fresh project, you can also run them manually:

```bash
psql "$DATABASE_URL" -f supabase/migrations/001_khatm_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/002_security_fixes.sql
psql "$DATABASE_URL" -f supabase/migrations/003_acceptance_fixes.sql
```

---

## Environment Variables

| Variable | Required By | Description |
|----------|-------------|-------------|
| `SUPABASE_URL` | Client app (`@/lib/supabase`), Edge Function | Your project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_ANON_KEY` | Client app | Public anon key for client-side queries |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function only | Bypasses RLS; never expose to the client |

The Edge Function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `Deno.env`. These are automatically injected in Supabase-hosted Edge Functions. For local development:

```bash
supabase functions serve notification-scheduler --env-file .env.local
```

`.env.local`:
```
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
```

---

## Known Wiring Gaps

| Gap | Description | Where to fix |
|-----|-------------|-------------|
| **T-08 `wired: 'pending'`** | `useAutoTracking` is implemented but not called from the Quran reader. `src/app/(quran-reader)/[page].tsx` does not exist. | Create the Quran reader screen file and add the `KhatmAutoTracker` child component pattern described in Step 3 above. |
| **T-18 `wired: 'pending'`** | `GroupKhatmScreen` is implemented but the navigator wiring needs to be verified against the actual app shell tab navigator once it exists. | Confirm `KhatmStackNavigator` is mounted in the correct tab slot in `src/app/(tabs)/_layout.tsx`. |
| **T-19 `wired: 'pending'`** | `CompletionScreen` is wired within `KhatmStackNavigator` but navigation to it (`navigation.navigate('Completion', { groupId })`) is driven by `useKhatmRealtime`'s `onGroupCompleted` callback in `GroupKhatmScreen`. Verify callback reaches the screen correctly. | No separate action needed once T-18 is wired. |
| **Push token storage** | No `user_push_tokens` table exists. The Edge Function falls back to `app_metadata` but this requires service role access outside the scheduled function context. | Decide on storage strategy and implement it independently of the Khatm migrations. |
| **Notification deduplication scope** | The `alreadySentToday` function checks `khatm_audit_log` for `NOTIFICATION_SENT` entries. This works only after the SA-012 INSERT policy fix (migration 003) is applied. | Migration 003 already fixes this. |
