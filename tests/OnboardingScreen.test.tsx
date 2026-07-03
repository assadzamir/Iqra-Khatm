// ---------------------------------------------------------------------------
// T-11 Tests: OnboardingScreen
// ---------------------------------------------------------------------------
// Run with: npx jest tests/OnboardingScreen.test.tsx
// ---------------------------------------------------------------------------

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: any[]) => mockReplace(...args),
  },
  Stack: Object.assign(
    ({ children }: any) => children,
    {
      Screen: () => null,
    }
  ),
}));

const mockSetProfile = jest.fn();
let mockSession: { user: { id: string } } | null = { user: { id: 'user-123' } };

jest.mock('../src/features/auth/store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: any) => any) =>
      selector({
        session: mockSession,
        setProfile: mockSetProfile,
      }),
    {
      getState: () => ({ setProfile: mockSetProfile }),
    }
  ),
}));

const mockSupabaseInsert = jest.fn();
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: mockSupabaseInsert,
        }),
      }),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import OnboardingScreen from '../src/app/(auth)/onboarding';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = { user: { id: 'user-123' } };
  });

  it('renders display name input and continue button', () => {
    const { getByLabelText, getByText } = render(<OnboardingScreen />);
    expect(getByLabelText('Display name')).toBeTruthy();
    expect(getByText('Continue')).toBeTruthy();
  });

  it('shows validation error when display name is too short', async () => {
    const { getByLabelText, getByText } = render(<OnboardingScreen />);
    fireEvent.changeText(getByLabelText('Display name'), 'A');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => {
      expect(
        getByText('Display name must be between 2 and 50 characters')
      ).toBeTruthy();
    });
  });

  it('shows validation error when display name is empty', async () => {
    const { getByText } = render(<OnboardingScreen />);
    fireEvent.press(getByText('Continue'));
    await waitFor(() => {
      expect(
        getByText('Display name must be between 2 and 50 characters')
      ).toBeTruthy();
    });
  });

  it('calls supabase insert and setProfile on success, then navigates', async () => {
    const fakeProfile = { id: 'user-123', display_name: 'Ahmad', created_at: '', updated_at: '' };
    mockSupabaseInsert.mockResolvedValueOnce({ data: fakeProfile, error: null });

    const { getByLabelText, getByText } = render(<OnboardingScreen />);
    fireEvent.changeText(getByLabelText('Display name'), 'Ahmad');
    fireEvent.press(getByText('Continue'));

    await waitFor(() => {
      expect(mockSetProfile).toHaveBeenCalledWith(fakeProfile);
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  it('shows connection error when supabase insert fails', async () => {
    mockSupabaseInsert.mockResolvedValueOnce({ data: null, error: { message: 'network error' } });

    const { getByLabelText, getByText } = render(<OnboardingScreen />);
    fireEvent.changeText(getByLabelText('Display name'), 'Ahmad');
    fireEvent.press(getByText('Continue'));

    await waitFor(() => {
      expect(
        getByText('Could not save your name. Check your connection and try again.')
      ).toBeTruthy();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to login and returns null when session is null', () => {
    mockSession = null;
    const { toJSON } = render(<OnboardingScreen />);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    expect(toJSON()).toBeNull();
  });
});
