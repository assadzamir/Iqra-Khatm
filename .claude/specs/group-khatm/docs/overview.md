# Group Khatm — Developer Overview

Group Khatm is a collaborative Quran completion feature built into the Iqra React Native app (Expo SDK 52). An authenticated user creates a group with a 5-step flow (starting with Niyyah/intention), divides the 30 Juz of the Quran among participants via a live 30-tile grid, and tracks collective reading progress in real time through Supabase Realtime. Participants join via an 8-character invite code, read in the Iqra Quran reader with auto-tracked progress, and receive push notification reminders via a scheduled Supabase Edge Function. The feature supports admin/co-admin role delegation, PARTICIPANT self-claim mode, configurable reminder windows, and a completion ceremony screen with a shareable card and cycle restart.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Expo App Shell                        │
│           (React Navigation, Quran Reader, Auth)            │
└──────────────────────────┬──────────────────────────────────┘
                           │
            ┌──────────────▼──────────────┐
            │     src/features/khatm/     │
            │       (feature module)      │
            │                             │
            │  screens/                   │
            │   GroupKhatmScreen          │
            │   CompletionScreen          │
            │                             │
            │  components/                │
            │   JuzGrid, JuzTile          │
            │   JuzBottomSheet            │
            │   CreateKhatmBottomSheet    │
            │   GroupSettingsBottomSheet  │
            │   AdminSummaryCard          │
            │   MembersSection            │
            │   BismillahOverlay          │
            │   CollectiveProgressBar     │
            │                             │
            │  hooks/                     │
            │   useKhatmQueries           │
            │   useKhatmMutations         │
            │   useAutoTracking           │
            │                             │
            │  store.ts (Zustand+MMKV)    │
            │  types.ts / constants.ts    │
            │  navigation.tsx / index.ts  │
            └──────────┬──────────────────┘
                       │
         ┌─────────────▼──────────────────────────┐
         │            Supabase                    │
         │                                        │
         │  Postgres (khatm_* tables)             │
         │  Realtime (postgres_changes)           │
         │  Auth (auth.uid())                     │
         │  Edge Functions                        │
         │   notification-scheduler               │
         │   (Deno, cron 06:00 UTC daily)         │
         └────────────────────────────────────────┘
```

**Data flow summary:**
- TanStack Query fetches and caches Supabase data. `useKhatmRealtime` subscribes to `postgres_changes` and calls `queryClient.invalidateQueries` on any Juz assignment or group status change.
- Zustand + MMKV holds ephemeral UI state (accordion open/closed, active reading context) plus the one persisted field (`activeGroupId`).
- Mutations write to Supabase directly; SECURITY DEFINER RPCs (`generate_invite_code`, `claim_juz`, `start_new_cycle`) enforce business rules server-side.

---

## Feature Module Structure

```
src/features/khatm/
├── index.ts                    — Barrel: re-exports all public types, hooks, store, navigator
├── types.ts                    — 8 union types + 13 interfaces derived from Postgres schema
├── constants.ts                — JUZ_PAGE_RANGES, KHATM_COLORS, permission arrays, thresholds
├── store.ts                    — Zustand store: 6 state fields + 6 setters, MMKV persistence
├── navigation.tsx              — KhatmStackNavigator (GroupKhatm → Completion)
│
├── hooks/
│   ├── useKhatmQueries.ts      — useKhatmGroups, useKhatmScreen, useKhatmRealtime + key factory
│   ├── useKhatmMutations.ts    — 8 mutation hooks for all write operations
│   └── useAutoTracking.ts      — Page-change tracker, 2-page throttle, MMKV failure queue
│
├── screens/
│   ├── GroupKhatmScreen.tsx    — Main screen: header, progress bar, 4 accordion sections
│   └── CompletionScreen.tsx    — Full-screen ceremony: Al-Fatiha, Du'a, Share/Cycle/Archive
│
├── components/
│   ├── JuzGrid.tsx             — FlatList, 5 columns, O(1) getItemLayout
│   ├── JuzTile.tsx             — 4 visual states, SVG progress ring, animated press scale
│   ├── JuzBottomSheet.tsx      — 4 tabs (Assign/Reassign/Progress/Remind), role-gated
│   ├── CreateKhatmBottomSheet.tsx — 5-step creation form with BismillahOverlay
│   ├── GroupSettingsBottomSheet.tsx — Group management: settings, reminders, invites
│   ├── AdminSummaryCard.tsx    — Stalled assignments, admin/co-admin only
│   ├── MembersSection.tsx      — Accordion, role badges, promote/demote alerts
│   ├── BismillahOverlay.tsx    — Full-screen modal with 2-second auto-dismiss
│   └── CollectiveProgressBar.tsx — Animated fill, 0–30 Juz completed
│
└── assets/
    └── dua-khatm.json          — Du'a Khatm al-Quran (AR+EN content-ready, others flagged)
```

---

## Key Dependencies

| Package | Role |
|---------|------|
| `@supabase/supabase-js` | Postgres client, Realtime subscriptions, Auth |
| `@tanstack/react-query` | Server state caching and invalidation |
| `zustand` + `zustand/middleware` | Client state management with `persist` |
| `react-native-mmkv` (via `@/lib/mmkv`) | Fast synchronous storage for persistence |
| `@gorhom/bottom-sheet` | Juz tile sheets, creation form, settings panel |
| `expo-notifications` | Push token registration; sending handled by Edge Function |
| `@react-navigation/native-stack` | KhatmStackNavigator (GroupKhatm + Completion screens) |
| `@react-native-community/slider` | Progress slider in JuzBottomSheet |

---

## Out of Scope (v1)

- WhatsApp/SMS/email sending — push notifications only
- HifzAI memorization progress linked to Khatm assignments
- Sub-Juz (half-Juz) assignment granularity
- Web-only join form — Iqra app download required
- Broadcast messaging to group members
- AI-powered admin summaries (data structure supports it; v1 is rules-based)
- `max_per_juz > 2` — schema supports arbitrary `smallint` but UI caps at 2
- AUTO and MIXED assignment modes — v1 has ADMIN and PARTICIPANT only
- PAUSED group status — v1 has ACTIVE, COMPLETED, ARCHIVED only
- `privacy_share_progress` column enforcement — column reserved but not enforced
- Per-Juz completion and group completion push notifications from the Edge Function — deadline and stall reminders are implemented; milestone pushes are not (see acceptance.md US-7 AC-4/5/6 FAIL)
