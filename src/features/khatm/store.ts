import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv'; // existing MMKV adapter in Iqra app
import type { KhatmReadingContext } from './types';

/**
 * Zustand store for Group Khatm client state.
 *
 * Persistence strategy (MMKV):
 *   - PERSISTED: activeGroupId — survives app restarts
 *   - EPHEMERAL: all accordion collapse states, activeReadingContext — reset on restart
 *
 * Initialization semantics:
 *   - juzGridCollapsed: false (grid starts expanded on fresh load)
 *   - membersCollapsed: true (collapsed by default to reduce visual noise)
 *   - inviteJoinCollapsed: true (collapsed by default)
 *   - remindersCollapsed: true (collapsed by default)
 *   - inviteJoinCollapsed is programmatically set to false by GroupKhatmScreen
 *     when the joinCode navigation param is present (deep link join flow)
 *   - activeReadingContext: null until "Start Reading" is tapped in JuzBottomSheet.
 *     Cleared to null when the participant exits the Quran reader or when Juz
 *     reaches 100% progress. NOT persisted — if the app crashes during reading,
 *     context is lost but all DB progress already written is preserved.
 */

interface KhatmStore {
  // ── Persisted via MMKV ──────────────────────────────────────────────────────
  activeGroupId: string | null;

  // ── Ephemeral UI state (accordion sections) ─────────────────────────────────
  /** Juz Grid accordion. Default: false (expanded). Reset on app restart. */
  juzGridCollapsed: boolean;
  /** Members accordion. Default: true (collapsed). Reset on app restart. */
  membersCollapsed: boolean;
  /** Invite & Join accordion. Default: true (collapsed). Reset on app restart. */
  inviteJoinCollapsed: boolean;
  /** Reminders & Settings accordion. Default: true (collapsed). Reset on app restart. */
  remindersCollapsed: boolean;
  /** Active reading context set when participant taps "Start Reading". */
  activeReadingContext: KhatmReadingContext | null;

  // ── Explicit setters (all flags MUST have setters — prevents silent dead state) ──
  setActiveGroupId: (id: string | null) => void;
  setJuzGridCollapsed: (collapsed: boolean) => void;
  setMembersCollapsed: (collapsed: boolean) => void;
  setInviteJoinCollapsed: (collapsed: boolean) => void;
  setRemindersCollapsed: (collapsed: boolean) => void;
  setActiveReadingContext: (ctx: KhatmReadingContext | null) => void;
}

export const useKhatmStore = create<KhatmStore>()(
  persist(
    (set) => ({
      // ── Initial values ──
      activeGroupId: null,
      juzGridCollapsed: false,
      membersCollapsed: true,
      inviteJoinCollapsed: true,
      remindersCollapsed: true,
      activeReadingContext: null,

      // ── Setters ──
      setActiveGroupId: (id) => set({ activeGroupId: id }),
      setJuzGridCollapsed: (collapsed) => set({ juzGridCollapsed: collapsed }),
      setMembersCollapsed: (collapsed) => set({ membersCollapsed: collapsed }),
      setInviteJoinCollapsed: (collapsed) => set({ inviteJoinCollapsed: collapsed }),
      setRemindersCollapsed: (collapsed) => set({ remindersCollapsed: collapsed }),
      setActiveReadingContext: (ctx) => set({ activeReadingContext: ctx }),
    }),
    {
      name: 'khatm-store',
      storage: createJSONStorage(() => mmkvStorage),
      // Only persist activeGroupId — all other state is ephemeral
      partialize: (state) => ({
        activeGroupId: state.activeGroupId,
      }),
    }
  )
);
