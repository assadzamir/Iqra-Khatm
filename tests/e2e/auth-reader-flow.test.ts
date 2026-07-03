/**
 * T-23: E2E Auth Flow Tests
 * Covers: US-1, US-2, US-4, US-5
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signInWithOtp: jest.fn(),
      verifyOtp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

jest.mock('expo-router', () => {
  // require inside the factory — jest.mock factories cannot reference
  // out-of-scope variables like the top-level React import
  const mockReact = require('react');
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    useLocalSearchParams: jest.fn(() => ({})),
    Redirect: ({ href }: { href: string }) =>
      mockReact.createElement('Redirect', { href }),
    Stack: { Screen: ({ options }: { options: object }) =>
      mockReact.createElement('StackScreen', options as object) },
    Tabs: Object.assign(
      ({ children }: { children: unknown }) =>
        mockReact.createElement('Tabs', null, children),
      { Screen: () => null }
    ),
  };
});

jest.mock('@/features/auth/store', () => ({
  useAuthStore: jest.fn(() => ({
    session: null,
    profile: null,
    isLoading: false,
    setSession: jest.fn(),
    setProfile: jest.fn(),
    setIsLoading: jest.fn(),
    signOut: jest.fn(),
  })),
}));

const { supabase } = require('@/lib/supabase');

// Lazy imports to ensure mocks are set up first
const getLoginScreen = () => require('@/app/(auth)/login').default;
const getForgotPasswordScreen = () => require('@/app/(auth)/forgot-password').default;
const getOTPScreen = () => require('@/app/(auth)/otp').default;
const getTabsLayout = () => require('@/app/(tabs)/_layout').default;

beforeEach(() => {
  jest.clearAllMocks();
});

// Scenario 1: Login — invalid credentials
test('Login: shows "Invalid email or password" on invalid credentials', async () => {
  // supabase-js resolves with { error } — it does not reject on auth errors
  (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
    data: { user: null, session: null },
    error: {
      message: 'Invalid login credentials',
      status: 400,
      name: 'AuthApiError',
    },
  });

  const LoginScreen = getLoginScreen();
  const { getByLabelText, getByText } = render(React.createElement(LoginScreen));

  fireEvent.changeText(getByLabelText('Email address'), 'test@example.com');
  fireEvent.changeText(getByLabelText('Password'), 'wrongpassword');
  fireEvent.press(getByText('Log In'));

  await waitFor(() => {
    expect(getByText('Invalid email or password')).toBeTruthy();
  });
});

// Scenario 2: Login — invalid email format (no network call)
test('Login: shows validation error for invalid email format', async () => {
  const LoginScreen = getLoginScreen();
  const { getByLabelText, getByText, queryByText } = render(
    React.createElement(LoginScreen)
  );

  fireEvent.changeText(getByLabelText('Email address'), 'notanemail');
  fireEvent.changeText(getByLabelText('Password'), 'password123');
  fireEvent.press(getByText('Log In'));

  await waitFor(() => {
    expect(getByText('Enter a valid email address')).toBeTruthy();
  });
  expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
});

// Scenario 3: Forgot password — enumeration prevention
test('ForgotPassword: always shows success message regardless of email existence', async () => {
  (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({ data: {}, error: null });

  const ForgotPasswordScreen = getForgotPasswordScreen();
  const { getByLabelText, getByText } = render(React.createElement(ForgotPasswordScreen));

  fireEvent.changeText(getByLabelText('Email address'), 'unknown@example.com');
  fireEvent.press(getByText('Send reset email'));

  await waitFor(() => {
    expect(getByText('Password reset email sent. Check your inbox.')).toBeTruthy();
  });
});

// Scenario 4: OTP — phone validation
test('OTP: shows error for phone without + prefix', async () => {
  const OTPScreen = getOTPScreen();
  const { getByLabelText, getByText } = render(React.createElement(OTPScreen));

  fireEvent.changeText(getByLabelText('Phone number'), '12345');
  fireEvent.press(getByText('Send code'));

  await waitFor(() => {
    expect(
      getByText('Enter a valid phone number with country code (e.g., +1234567890)')
    ).toBeTruthy();
  });
  expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
});

// Scenario 5: Auth gate — tabs layout redirects when unauthenticated
test('TabsLayout: redirects to login when session is null', () => {
  const TabsLayout = getTabsLayout();
  const { UNSAFE_root } = render(React.createElement(TabsLayout));

  // When session=null, isLoading=false, should render Redirect to /(auth)/login
  const redirect = UNSAFE_root.findAll((node: { type: string; props: { href: string } }) =>
    node.type === 'Redirect' && node.props.href === '/(auth)/login'
  );
  expect(redirect.length).toBeGreaterThan(0);
});
