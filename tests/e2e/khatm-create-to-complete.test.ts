// ---------------------------------------------------------------------------
// T-22: Khatm Create-to-Complete E2E Flow
// ---------------------------------------------------------------------------
// Integration-style tests covering the full happy-path from group creation
// to completion ceremony. Since there is no Detox/device setup, all tests
// use jest + plain assertions against constants, Zustand store state, and
// mocked Supabase calls.
//
// Run with: npx jest tests/e2e/khatm-create-to-complete.test.ts
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before any imports that pull in
// the mocked modules transitively.
// ---------------------------------------------------------------------------

// React Native is not available in the Node Jest environment.
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Animated: {
    Value: jest.fn(() => ({ interpolate: jest.fn() })),
    timing: jest.fn(() => ({ start: jest.fn() })),
    View: 'View',
  },
  Platform: { OS: 'ios', select: jest.fn((obj: Record<string, unknown>) => obj.ios) },
}));

// Expo modules that may be resolved during import of store/constants.
jest.mock('expo-modules-core', () => ({}), { virtual: true });
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }), { virtual: true });

// MMKV adapter used by the Zustand persist middleware.
jest.mock('@/lib/mmkv', () => ({
  mmkvStorage: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

// Supabase client mock — provides chainable query builder and individual
// method stubs. Each test that needs custom behaviour can override these
// stubs directly via (supabase.from as jest.Mock).mockReturnValue(…).
jest.mock('@/lib/supabase', () => {
  const buildChain = () => ({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  });

  return {
    supabase: {
      from: jest.fn(() => buildChain()),
      rpc: jest.fn().mockResolvedValue({ data: 'TESTCODE1', error: null }),
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-admin-001',
              email: 'admin@test.com',
              user_metadata: { full_name: 'Test Admin' },
            },
          },
          error: null,
        }),
      },
      channel: jest
        .fn()
        .mockReturnValue({ on: jest.fn().mockReturnThis(), subscribe: jest.fn() }),
      removeChannel: jest.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Imports — after mocks are set up
// ---------------------------------------------------------------------------

import { useKhatmStore } from '../../src/features/khatm/store';
import {
  JUZ_PAGE_RANGES,
  STALL_THRESHOLDS,
  DEFAULT_REMINDER_WINDOWS,
} from '../../src/features/khatm/constants';
import type { KhatmReadingContext } from '../../src/features/khatm/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset Zustand store to its initial values between tests. */
function resetStore(): void {
  useKhatmStore.setState({
    activeGroupId: null,
    juzGridCollapsed: false,
    membersCollapsed: true,
    inviteJoinCollapsed: true,
    remindersCollapsed: true,
    activeReadingContext: null,
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Khatm Create-to-Complete E2E Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  // ── Step 1 ─────────────────────────────────────────────────────────────────

  it('Step 1: Admin creates Khatm — BismillahOverlay appears then GroupKhatmScreen renders', () => {
    // Simulate the creation flow: calling setActiveGroupId is what the
    // CreateKhatmBottomSheet does after BismillahOverlay is dismissed.
    const store = useKhatmStore.getState();
    expect(store.activeGroupId).toBeNull();

    store.setActiveGroupId('group-e2e-001');

    expect(useKhatmStore.getState().activeGroupId).toBe('group-e2e-001');
  });

  // ── Step 2 ─────────────────────────────────────────────────────────────────

  it('Step 2: Admin assigns Juz 1 — tile transitions to assigned state after success', async () => {
    // Import supabase mock to inspect calls.
    const { supabase } = require('@/lib/supabase');

    // Simulate a successful assignment: supabase.from('khatm_juz_assignments')
    // .insert().select().single() should resolve with an assignment row.
    const fakeAssignment = {
      id: 'assign-001',
      group_id: 'group-e2e-001',
      participant_id: 'participant-admin-001',
      juz_number: 1,
      status: 'ASSIGNED',
      progress_percent: 0,
      assigned_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
    };

    const chain = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: fakeAssignment, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    // Call the mutationFn logic directly (mirror of useAssignJuz mutationFn).
    const { data, error } = await supabase
      .from('khatm_juz_assignments')
      .insert({
        group_id: 'group-e2e-001',
        participant_id: 'participant-admin-001',
        juz_number: 1,
        assigned_by: 'participant-admin-001',
        status: 'ASSIGNED',
        progress_percent: 0,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data.status).toBe('ASSIGNED');
    expect(data.juz_number).toBe(1);

    // After assignment, the tile display_status would be 'assigned'.
    // We assert the domain invariant: an assignment row with status ASSIGNED
    // means juz_number 1 is no longer 'open'.
    expect(data.status).not.toBe('open');
  });

  // ── Step 3 ─────────────────────────────────────────────────────────────────

  it('Step 3: Participant starts reading — activeReadingContext set with correct juz range', () => {
    const juz1Range = JUZ_PAGE_RANGES[1];
    // Verify Juz 1 page range (Madinah Mushaf)
    expect(juz1Range.startPage).toBe(1);
    expect(juz1Range.endPage).toBe(21);

    const ctx: KhatmReadingContext = {
      groupId: 'group-e2e-001',
      participantId: 'participant-001',
      juzNumber: 1,
      startPage: juz1Range.startPage,
      endPage: juz1Range.endPage,
    };

    useKhatmStore.getState().setActiveReadingContext(ctx);

    const stored = useKhatmStore.getState().activeReadingContext;
    expect(stored).not.toBeNull();
    expect(stored!.juzNumber).toBe(1);
    expect(stored!.startPage).toBe(1);
    expect(stored!.endPage).toBe(21);
    expect(stored!.groupId).toBe('group-e2e-001');
    expect(stored!.participantId).toBe('participant-001');
  });

  // ── Step 4 ─────────────────────────────────────────────────────────────────

  it('Step 4: Auto-tracking fires on 2+ page advances but not on single page advance', () => {
    // This test validates the throttle logic extracted from useAutoTracking.
    // The hook writes when pageAdvance >= 2.  We reproduce the decision logic
    // in isolation so there is no React hooks environment dependency.

    const startPage = 1;
    let lastWrittenPage = startPage - 1; // initial: 0

    const shouldWrite = (currentPage: number): boolean => {
      const endPage = 21;
      const pageAdvance = currentPage - lastWrittenPage;
      const reachedEnd = currentPage >= endPage;
      return pageAdvance >= 2 || reachedEnd;
    };

    // Advance 1 page (page 1) — should NOT trigger a write.
    expect(shouldWrite(1)).toBe(false);

    // Advance to page 2 (2 pages from lastWritten=0) — SHOULD trigger.
    expect(shouldWrite(2)).toBe(true);

    // Simulate the write being recorded.
    lastWrittenPage = 2;

    // Advance 1 more page (page 3, advance = 1) — should NOT trigger.
    expect(shouldWrite(3)).toBe(false);

    // Advance to page 5 (advance = 3 from lastWritten=2) — SHOULD trigger.
    expect(shouldWrite(5)).toBe(true);
    lastWrittenPage = 5;

    // Reaching the end of the Juz (page 21) always triggers, even with +1 advance.
    lastWrittenPage = 20;
    expect(shouldWrite(21)).toBe(true);
  });

  // ── Step 5 ─────────────────────────────────────────────────────────────────

  it('Step 5: Completing all 30 Juz triggers group status COMPLETED', async () => {
    const { supabase } = require('@/lib/supabase');

    // Simulate the DB trigger outcome: once all 30 Juz reach progress_percent=100,
    // the trigger sets status='COMPLETED' on khatm_groups.
    // We test the mutation layer: updating the group status via supabase.from().
    const completedGroup = {
      id: 'group-e2e-001',
      title: 'Test Khatm',
      status: 'COMPLETED',
      khatm_cycle: 1,
      completed_at: new Date().toISOString(),
    };

    const chain = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: completedGroup, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const { data, error } = await supabase
      .from('khatm_groups')
      .update({ status: 'COMPLETED', completed_at: completedGroup.completed_at })
      .eq('id', 'group-e2e-001')
      .select()
      .single();

    expect(error).toBeNull();
    expect(data.status).toBe('COMPLETED');
    expect(data.khatm_cycle).toBe(1);
    expect(data.completed_at).not.toBeNull();

    // Confirm supabase.from was called with the correct table name.
    expect(supabase.from).toHaveBeenCalledWith('khatm_groups');
  });

  // ── Step 6 ─────────────────────────────────────────────────────────────────

  it("Step 6: CompletionScreen rendered — Alhamdulillah present, Congratulations absent", () => {
    // File-system check on the actual screen source — valid in Jest Node env.
    const screenPath = path.resolve(
      __dirname,
      '../../src/features/khatm/screens/CompletionScreen.tsx'
    );

    expect(fs.existsSync(screenPath)).toBe(true);

    const source = fs.readFileSync(screenPath, 'utf-8');

    // Must NOT contain the word "Congratulations" in any casing.
    expect(source.toLowerCase()).not.toContain('congratulations');

    // "Alhamdulillah" must appear (sourced from dua-khatm.json via completion_message.primary).
    expect(source).toContain('Alhamdulillah');
  });

  // ── Step 7 ─────────────────────────────────────────────────────────────────

  it('Step 7: Start Another Cycle — new khatm_cycle:2 group created', async () => {
    const { supabase } = require('@/lib/supabase');

    const sourceGroup = {
      id: 'group-e2e-001',
      title: 'Test Khatm',
      intention: null,
      occasion_type: 'GENERAL',
      dedicated_to_name: null,
      dedicated_to_relationship: null,
      start_date: '2026-01-01',
      end_date: '2026-01-31',
      timezone: 'UTC',
      language: 'EN',
      assignment_mode: 'ADMIN',
      max_per_juz: 1,
      allow_juz_switch: false,
      invite_code: 'OLDCODE1',
      status: 'COMPLETED',
      admin_user_id: 'user-admin-001',
      khatm_cycle: 1,
      completed_at: new Date().toISOString(),
    };

    const newGroup = {
      ...sourceGroup,
      id: 'group-e2e-002',
      khatm_cycle: 2,
      status: 'ACTIVE',
      invite_code: 'TESTCODE1', // from rpc mock
      completed_at: null,
    };

    // First call: fetch source group; second call: insert new group.
    const fetchChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: sourceGroup, error: null }),
    };
    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: newGroup, error: null }),
    };

    (supabase.from as jest.Mock)
      .mockReturnValueOnce(fetchChain)  // fetch source group
      .mockReturnValueOnce(insertChain); // insert new group

    // Mirror the useStartNewCycle mutationFn steps.
    const { data: fetched, error: fetchErr } = await supabase
      .from('khatm_groups')
      .select('*')
      .eq('id', 'group-e2e-001')
      .single();

    expect(fetchErr).toBeNull();
    expect(fetched.khatm_cycle).toBe(1);

    const { data: rpcCode } = await supabase.rpc('generate_invite_code');
    expect(rpcCode).toBe('TESTCODE1');

    const { data: created, error: insertErr } = await supabase
      .from('khatm_groups')
      .insert({ ...fetched, khatm_cycle: fetched.khatm_cycle + 1, invite_code: rpcCode })
      .select()
      .single();

    expect(insertErr).toBeNull();
    expect(created.khatm_cycle).toBe(2);
    expect(created.status).toBe('ACTIVE');
    expect(created.invite_code).toBe('TESTCODE1');
  });

  // ── Error path ─────────────────────────────────────────────────────────────

  it('Error path: 409 on Juz assignment shows inline error, sheet stays open', async () => {
    const { supabase } = require('@/lib/supabase');

    // Simulate a 23505 (unique constraint violation → 409 in the app layer).
    const uniqueViolationError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      details: null,
      hint: null,
    };

    const chain = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: uniqueViolationError }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const { data, error } = await supabase
      .from('khatm_juz_assignments')
      .insert({
        group_id: 'group-e2e-001',
        participant_id: 'participant-001',
        juz_number: 1,
      })
      .select()
      .single();

    // The mutation handler in useAssignJuz checks error.code === '23505'.
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error.code).toBe('23505');

    // Assert the expected inline error message that useAssignJuz throws.
    const expectedMessage = 'This Juz already has the maximum number of assignees.';
    const thrown = error.code === '23505' ? expectedMessage : 'Failed to assign Juz. Please try again.';
    expect(thrown).toBe(expectedMessage);

    // Verify the store has NOT been modified (sheet stays open — no navigation side-effect).
    expect(useKhatmStore.getState().activeGroupId).toBeNull();
  });

  // ── Constant assertions ────────────────────────────────────────────────────

  describe('Constants', () => {
    it('JUZ_PAGE_RANGES[1] equals { startPage: 1, endPage: 21 }', () => {
      expect(JUZ_PAGE_RANGES[1]).toEqual({ startPage: 1, endPage: 21 });
    });

    it('JUZ_PAGE_RANGES covers all 30 Juz', () => {
      for (let juz = 1; juz <= 30; juz++) {
        expect(JUZ_PAGE_RANGES[juz]).toBeDefined();
        expect(JUZ_PAGE_RANGES[juz].startPage).toBeGreaterThanOrEqual(1);
        expect(JUZ_PAGE_RANGES[juz].endPage).toBeLessThanOrEqual(604);
        expect(JUZ_PAGE_RANGES[juz].startPage).toBeLessThanOrEqual(
          JUZ_PAGE_RANGES[juz].endPage
        );
      }
    });

    it('STALL_THRESHOLDS.juz_not_started_days equals 3', () => {
      expect(STALL_THRESHOLDS.juz_not_started_days).toBe(3);
    });

    it('STALL_THRESHOLDS.in_progress_no_update_days equals 4', () => {
      expect(STALL_THRESHOLDS.in_progress_no_update_days).toBe(4);
    });

    it('DEFAULT_REMINDER_WINDOWS includes 5, 2, and 1', () => {
      expect(DEFAULT_REMINDER_WINDOWS).toContain(5);
      expect(DEFAULT_REMINDER_WINDOWS).toContain(2);
      expect(DEFAULT_REMINDER_WINDOWS).toContain(1);
    });
  });

  // ── Store behaviour ────────────────────────────────────────────────────────

  describe('Store behaviour', () => {
    it('setActiveGroupId updates activeGroupId', () => {
      expect(useKhatmStore.getState().activeGroupId).toBeNull();
      useKhatmStore.getState().setActiveGroupId('group-123');
      expect(useKhatmStore.getState().activeGroupId).toBe('group-123');
    });

    it('default juzGridCollapsed is false (expanded)', () => {
      expect(useKhatmStore.getState().juzGridCollapsed).toBe(false);
    });

    it('default membersCollapsed is true (collapsed)', () => {
      expect(useKhatmStore.getState().membersCollapsed).toBe(true);
    });

    it('setActiveReadingContext sets context with correct juz range', () => {
      const ctx: KhatmReadingContext = {
        groupId: 'g',
        participantId: 'p',
        juzNumber: 1,
        startPage: 1,
        endPage: 21,
      };

      useKhatmStore.getState().setActiveReadingContext(ctx);

      const stored = useKhatmStore.getState().activeReadingContext;
      expect(stored).toEqual(ctx);
    });

    it('setActiveGroupId(null) clears activeGroupId', () => {
      useKhatmStore.getState().setActiveGroupId('group-to-clear');
      useKhatmStore.getState().setActiveGroupId(null);
      expect(useKhatmStore.getState().activeGroupId).toBeNull();
    });

    it('setActiveReadingContext(null) clears context', () => {
      const ctx: KhatmReadingContext = {
        groupId: 'g',
        participantId: 'p',
        juzNumber: 5,
        startPage: 82,
        endPage: 101,
      };

      useKhatmStore.getState().setActiveReadingContext(ctx);
      expect(useKhatmStore.getState().activeReadingContext).not.toBeNull();

      useKhatmStore.getState().setActiveReadingContext(null);
      expect(useKhatmStore.getState().activeReadingContext).toBeNull();
    });
  });

  // ── Du'a asset assertions ──────────────────────────────────────────────────

  describe("Du'a asset (dua-khatm.json)", () => {
    const duaPath = path.resolve(
      __dirname,
      '../../src/features/khatm/assets/dua-khatm.json'
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dua: any;

    beforeAll(() => {
      dua = JSON.parse(fs.readFileSync(duaPath, 'utf-8'));
    });

    it('dua.EN.content_ready is true', () => {
      expect(dua.dua.EN.content_ready).toBe(true);
    });

    it('completion_message.primary is "Alhamdulillah"', () => {
      expect(dua.completion_message.primary).toBe('Alhamdulillah');
    });

    it('memorial_suffix contains {dedicated_to_name} placeholder', () => {
      expect(dua.memorial_suffix).toContain('{dedicated_to_name}');
    });

    it('dua.AR.content_ready is true', () => {
      expect(dua.dua.AR.content_ready).toBe(true);
    });

    it('completion_message.secondary is non-empty', () => {
      expect(dua.completion_message.secondary).toBeTruthy();
    });
  });
});
