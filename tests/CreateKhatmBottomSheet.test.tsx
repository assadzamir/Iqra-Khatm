// ---------------------------------------------------------------------------
// T-16 Tests: CreateKhatmBottomSheet
// ---------------------------------------------------------------------------
// These tests verify the component's validation logic and state management
// in isolation using React Native Testing Library.
//
// Run with: npx jest tests/CreateKhatmBottomSheet.test.tsx
// ---------------------------------------------------------------------------

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock @gorhom/bottom-sheet — not available in Jest environment
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View, ScrollView } = require('react-native');

  const BottomSheetModal = React.forwardRef(
    ({ children, onDismiss }: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ dismiss: jest.fn() }));
      return <View testID="bottom-sheet-modal">{children}</View>;
    }
  );
  BottomSheetModal.displayName = 'BottomSheetModal';

  const BottomSheetScrollView = ({ children, contentContainerStyle }: any) => (
    <ScrollView contentContainerStyle={contentContainerStyle}>
      {children}
    </ScrollView>
  );

  return { BottomSheetModal, BottomSheetScrollView };
});

// Mock BismillahOverlay (named export)
jest.mock(
  '../src/features/khatm/components/BismillahOverlay',
  () => ({
    BismillahOverlay: ({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) => {
      const React = require('react');
      const { View, Text, Pressable } = require('react-native');
      if (!visible) return null;
      return (
        <View testID="bismillah-overlay">
          <Text>BismillahOverlay</Text>
          <Pressable testID="bismillah-dismiss" onPress={onDismiss}>
            <Text>Dismiss</Text>
          </Pressable>
        </View>
      );
    },
  })
);

// Mock useCreateKhatm
const mockMutate = jest.fn();
let mockIsSuccess = false;
let mockIsError = false;
let mockData: { id: string } | undefined = undefined;

jest.mock('../src/features/khatm/hooks/useKhatmMutations', () => ({
  useCreateKhatm: () => ({
    mutate: mockMutate,
    isSuccess: mockIsSuccess,
    isError: mockIsError,
    data: mockData,
    isPending: false,
  }),
}));

// Mock useKhatmStore
const mockSetActiveGroupId = jest.fn();
jest.mock('../src/features/khatm/store', () => ({
  useKhatmStore: Object.assign(
    () => ({ setActiveGroupId: mockSetActiveGroupId }),
    {
      getState: () => ({ setActiveGroupId: mockSetActiveGroupId }),
    }
  ),
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { CreateKhatmBottomSheet } from '../src/features/khatm/components/CreateKhatmBottomSheet';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSheetRef(): React.RefObject<BottomSheetModal> {
  return { current: null } as React.RefObject<BottomSheetModal>;
}

function renderSheet(onCreated = jest.fn()) {
  const sheetRef = buildSheetRef();
  const utils = render(
    <CreateKhatmBottomSheet sheetRef={sheetRef} onCreated={onCreated} />
  );
  return { ...utils, sheetRef, onCreated };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateKhatmBottomSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSuccess = false;
    mockIsError = false;
    mockData = undefined;
  });

  // ── Step 1 rendering ────────────────────────────────────────────────────

  it('renders Step 1 with Arabic bismillah banner on mount', () => {
    const { getByText } = renderSheet();
    // Arabic text presence
    expect(getByText('بِسْمِ اللَّهِ')).toBeTruthy();
    // Step title
    expect(getByText('Niyyah (Intention)')).toBeTruthy();
  });

  it('renders all 6 occasion type chips on Step 1', () => {
    const { getByText } = renderSheet();
    ['GENERAL', 'MEMORIAL', 'RAMADAN', 'EID', 'SHIFA', 'CUSTOM'].forEach(
      (type) => expect(getByText(type)).toBeTruthy()
    );
  });

  // ── Step 1 → Step 2 navigation ───────────────────────────────────────────

  it('advances to Step 2 when Next is pressed on Step 1', () => {
    const { getByText } = renderSheet();
    fireEvent.press(getByText('Next'));
    expect(getByText('Group Details')).toBeTruthy();
  });

  // ── Step 2 validation: title required ────────────────────────────────────

  it('shows "Title is required" error and stays on Step 2 when title is blank', async () => {
    const { getByText, queryByText } = renderSheet();

    // Navigate to Step 2
    fireEvent.press(getByText('Next'));
    expect(getByText('Group Details')).toBeTruthy();

    // Press Next without entering a title
    fireEvent.press(getByText('Next'));

    await waitFor(() => {
      expect(getByText('Title is required')).toBeTruthy();
      // Still on Step 2
      expect(queryByText('Assignment Rules')).toBeNull();
    });
  });

  it('shows "Title is required" when title contains only whitespace', async () => {
    const { getByText, getByPlaceholderText } = renderSheet();

    fireEvent.press(getByText('Next'));
    fireEvent.changeText(getByPlaceholderText('Group name'), '   ');
    fireEvent.press(getByText('Next'));

    await waitFor(() => {
      expect(getByText('Title is required')).toBeTruthy();
    });
  });

  // ── Step 2 validation: end date after start date ─────────────────────────

  it('shows end date error when end_date <= start_date', async () => {
    const { getByText, getByPlaceholderText } = renderSheet();

    fireEvent.press(getByText('Next')); // → Step 2
    fireEvent.changeText(getByPlaceholderText('Group name'), 'Test Khatm');
    fireEvent.changeText(getByPlaceholderText('2025-01-01'), '2025-06-15');
    fireEvent.changeText(getByPlaceholderText('2025-01-30'), '2025-06-10');
    fireEvent.press(getByText('Next'));

    await waitFor(() => {
      expect(getByText('End date must be after start date')).toBeTruthy();
    });
  });

  // ── Step 2 → Step 3 navigation with valid data ───────────────────────────

  it('advances to Step 3 when title and dates are valid', async () => {
    const { getByText, getByPlaceholderText } = renderSheet();

    fireEvent.press(getByText('Next')); // → Step 2
    fireEvent.changeText(getByPlaceholderText('Group name'), 'Test Khatm');
    fireEvent.changeText(getByPlaceholderText('2025-01-01'), '2025-06-01');
    fireEvent.changeText(getByPlaceholderText('2025-01-30'), '2025-06-30');
    fireEvent.press(getByText('Next'));

    await waitFor(() => {
      expect(getByText('Assignment Rules')).toBeTruthy();
    });
  });

  // ── Back navigation preserves form data ─────────────────────────────────

  it('preserves title when navigating Back from Step 3 to Step 2', async () => {
    const { getByText, getByPlaceholderText } = renderSheet();

    fireEvent.press(getByText('Next')); // → Step 2
    fireEvent.changeText(getByPlaceholderText('Group name'), 'Preserved Title');
    fireEvent.changeText(getByPlaceholderText('2025-01-01'), '2025-06-01');
    fireEvent.changeText(getByPlaceholderText('2025-01-30'), '2025-06-30');
    fireEvent.press(getByText('Next')); // → Step 3

    await waitFor(() => getByText('Assignment Rules'));

    fireEvent.press(getByText('Back')); // → Step 2

    await waitFor(() => {
      const titleInput = getByPlaceholderText('Group name');
      expect((titleInput.props as any).value).toBe('Preserved Title');
    });
  });

  // ── Step 3 rendering ─────────────────────────────────────────────────────

  it('renders ADMIN and PARTICIPANT mode buttons on Step 3', async () => {
    const { getByText, getByPlaceholderText } = renderSheet();

    fireEvent.press(getByText('Next')); // → Step 2
    fireEvent.changeText(getByPlaceholderText('Group name'), 'Test');
    fireEvent.changeText(getByPlaceholderText('2025-01-01'), '2025-01-01');
    fireEvent.changeText(getByPlaceholderText('2025-01-30'), '2025-01-31');
    fireEvent.press(getByText('Next')); // → Step 3

    await waitFor(() => {
      expect(getByText('ADMIN')).toBeTruthy();
      expect(getByText('PARTICIPANT')).toBeTruthy();
    });
  });

  // ── Step 4: reminder validation ──────────────────────────────────────────

  it('shows duplicate reminder error when same day is added twice', async () => {
    const { getByText, getByPlaceholderText, getAllByText } = renderSheet();

    // Navigate to Step 4
    fireEvent.press(getByText('Next')); // → Step 2
    fireEvent.changeText(getByPlaceholderText('Group name'), 'Test');
    fireEvent.changeText(getByPlaceholderText('2025-01-01'), '2025-01-01');
    fireEvent.changeText(getByPlaceholderText('2025-01-30'), '2025-01-31');
    fireEvent.press(getByText('Next')); // → Step 3
    await waitFor(() => getByText('Assignment Rules'));
    fireEvent.press(getAllByText('Next')[0]); // → Step 4
    await waitFor(() => getByText('Reminder Schedule'));

    // Default windows include 5, try to add 5 again
    fireEvent.changeText(getByPlaceholderText('Days'), '5');
    fireEvent.press(getByText('Add Reminder'));

    await waitFor(() => {
      expect(getByText('A reminder for this day already exists')).toBeTruthy();
    });
  });

  it('shows "Must be 0 or more" error for negative reminder value', async () => {
    const { getByText, getByPlaceholderText, getAllByText } = renderSheet();

    // Navigate to Step 4
    fireEvent.press(getByText('Next')); // → Step 2
    fireEvent.changeText(getByPlaceholderText('Group name'), 'Test');
    fireEvent.changeText(getByPlaceholderText('2025-01-01'), '2025-01-01');
    fireEvent.changeText(getByPlaceholderText('2025-01-30'), '2025-01-31');
    fireEvent.press(getByText('Next')); // → Step 3
    await waitFor(() => getByText('Assignment Rules'));
    fireEvent.press(getAllByText('Next')[0]); // → Step 4
    await waitFor(() => getByText('Reminder Schedule'));

    fireEvent.changeText(getByPlaceholderText('Days'), '-1');
    fireEvent.press(getByText('Add Reminder'));

    await waitFor(() => {
      expect(getByText('Must be 0 or more')).toBeTruthy();
    });
  });

  // ── Step 5: review and submit ────────────────────────────────────────────

  it('calls createKhatm.mutate when Create is tapped on Step 5', async () => {
    const { getByText, getByPlaceholderText, getAllByText } = renderSheet();

    // Navigate through all steps
    fireEvent.press(getByText('Next')); // → Step 2
    fireEvent.changeText(getByPlaceholderText('Group name'), 'My Khatm');
    fireEvent.changeText(getByPlaceholderText('2025-01-01'), '2025-01-01');
    fireEvent.changeText(getByPlaceholderText('2025-01-30'), '2025-01-31');
    fireEvent.press(getByText('Next')); // → Step 3
    await waitFor(() => getByText('Assignment Rules'));
    fireEvent.press(getAllByText('Next')[0]); // → Step 4
    await waitFor(() => getByText('Reminder Schedule'));
    fireEvent.press(getAllByText('Next')[0]); // → Step 5
    await waitFor(() => getByText('Review'));

    fireEvent.press(getByText('Create'));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const callArg = mockMutate.mock.calls[0][0];
    expect(callArg.title).toBe('My Khatm');
    expect(callArg.timezone).toBeDefined();
  });

  // ── Step 5: error state ──────────────────────────────────────────────────

  it('displays error message when createKhatm fails', async () => {
    mockIsError = true;

    const { getByText, getByPlaceholderText, getAllByText, rerender } =
      renderSheet();

    // Navigate to Step 5
    fireEvent.press(getByText('Next')); // → Step 2
    fireEvent.changeText(getByPlaceholderText('Group name'), 'My Khatm');
    fireEvent.changeText(getByPlaceholderText('2025-01-01'), '2025-01-01');
    fireEvent.changeText(getByPlaceholderText('2025-01-30'), '2025-01-31');
    fireEvent.press(getByText('Next')); // → Step 3
    await waitFor(() => getByText('Assignment Rules'));
    fireEvent.press(getAllByText('Next')[0]); // → Step 4
    await waitFor(() => getByText('Reminder Schedule'));
    fireEvent.press(getAllByText('Next')[0]); // → Step 5
    await waitFor(() => getByText('Review'));

    fireEvent.press(getByText('Create'));

    await waitFor(() => {
      expect(
        getByText(
          'Failed to create group. Check your connection and try again.'
        )
      ).toBeTruthy();
    });
  });

  // ── BismillahOverlay appears on success ─────────────────────────────────

  it('shows BismillahOverlay after successful creation', async () => {
    mockIsSuccess = true;
    mockData = { id: 'group-abc-123' };

    const onCreated = jest.fn();
    const { getByText, getByPlaceholderText, getAllByText, getByTestId } =
      renderSheet(onCreated);

    // Navigate to Step 5
    fireEvent.press(getByText('Next')); // → Step 2
    fireEvent.changeText(getByPlaceholderText('Group name'), 'My Khatm');
    fireEvent.changeText(getByPlaceholderText('2025-01-01'), '2025-01-01');
    fireEvent.changeText(getByPlaceholderText('2025-01-30'), '2025-01-31');
    fireEvent.press(getByText('Next')); // → Step 3
    await waitFor(() => getByText('Assignment Rules'));
    fireEvent.press(getAllByText('Next')[0]); // → Step 4
    await waitFor(() => getByText('Reminder Schedule'));
    fireEvent.press(getAllByText('Next')[0]); // → Step 5
    await waitFor(() => getByText('Review'));

    fireEvent.press(getByText('Create'));

    // Because mockIsSuccess is already true, the useEffect fires on mount
    // and the overlay should be visible
    await waitFor(() => {
      expect(getByTestId('bismillah-overlay')).toBeTruthy();
    });
  });

  it('calls onCreated with group id when BismillahOverlay is dismissed', async () => {
    mockIsSuccess = true;
    mockData = { id: 'group-abc-123' };

    const onCreated = jest.fn();
    const { getByText, getByPlaceholderText, getAllByText, getByTestId } =
      renderSheet(onCreated);

    // Navigate to Step 5 and submit
    fireEvent.press(getByText('Next')); // → Step 2
    fireEvent.changeText(getByPlaceholderText('Group name'), 'My Khatm');
    fireEvent.changeText(getByPlaceholderText('2025-01-01'), '2025-01-01');
    fireEvent.changeText(getByPlaceholderText('2025-01-30'), '2025-01-31');
    fireEvent.press(getByText('Next')); // → Step 3
    await waitFor(() => getByText('Assignment Rules'));
    fireEvent.press(getAllByText('Next')[0]); // → Step 4
    await waitFor(() => getByText('Reminder Schedule'));
    fireEvent.press(getAllByText('Next')[0]); // → Step 5
    await waitFor(() => getByText('Review'));
    fireEvent.press(getByText('Create'));

    await waitFor(() => getByTestId('bismillah-overlay'));

    // Tap dismiss
    fireEvent.press(getByTestId('bismillah-dismiss'));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith('group-abc-123');
      expect(mockSetActiveGroupId).toHaveBeenCalledWith('group-abc-123');
    });
  });
});
