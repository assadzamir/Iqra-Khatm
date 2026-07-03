// ---------------------------------------------------------------------------
// T-7, T-8, T-9, T-10 Tests: Auth Screens
// ---------------------------------------------------------------------------
// Tests for Login, Signup, OTP, and ForgotPassword screens.
// Run with: npx jest tests/auth-screens.test.tsx
// ---------------------------------------------------------------------------

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockSignInWithOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockResetPasswordForEmail = jest.fn();
// user_profiles lookup used by login/otp to route to tabs vs onboarding
const mockMaybeSingle = jest.fn();
const mockFrom = jest.fn((..._args: any[]) => ({
  select: jest.fn(() => ({
    eq: jest.fn(() => ({
      maybeSingle: (...args: any[]) => mockMaybeSingle(...args),
    })),
  })),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: any[]) => mockSignInWithPassword(...args),
      signUp: (...args: any[]) => mockSignUp(...args),
      signInWithOtp: (...args: any[]) => mockSignInWithOtp(...args),
      verifyOtp: (...args: any[]) => mockVerifyOtp(...args),
      resetPasswordForEmail: (...args: any[]) => mockResetPasswordForEmail(...args),
    },
    from: (...args: any[]) => mockFrom(...args),
  },
}));

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: any[]) => mockRouterPush(...args),
    replace: (...args: any[]) => mockRouterReplace(...args),
  },
  Stack: ({ children }: any) => children,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import LoginScreen from '../src/app/(auth)/login';
import SignupScreen from '../src/app/(auth)/signup';
import OtpScreen from '../src/app/(auth)/otp';
import ForgotPasswordScreen from '../src/app/(auth)/forgot-password';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no profile row → auth success routes to onboarding
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
});

// ---------------------------------------------------------------------------
// T-7: Login Screen
// ---------------------------------------------------------------------------

describe('LoginScreen', () => {
  it('renders email and password inputs', () => {
    const { getByLabelText } = render(<LoginScreen />);
    expect(getByLabelText('Email address')).toBeTruthy();
    expect(getByLabelText('Password')).toBeTruthy();
  });

  it('shows email validation error for invalid email', async () => {
    const { getByLabelText, getByText } = render(<LoginScreen />);
    fireEvent.changeText(getByLabelText('Email address'), 'not-an-email');
    fireEvent.press(getByLabelText('Log In'));
    await waitFor(() => {
      expect(getByText('Enter a valid email address')).toBeTruthy();
    });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('calls signInWithPassword with trimmed email on valid input', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'user-1' }, session: {} },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'user-1' }, error: null });
    const { getByLabelText } = render(<LoginScreen />);
    fireEvent.changeText(getByLabelText('Email address'), '  user@example.com  ');
    fireEvent.changeText(getByLabelText('Password'), 'secret');
    fireEvent.press(getByLabelText('Log In'));
    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'secret',
      });
      // With an existing profile, login lands on the main dashboard
      expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  it('shows "Invalid email or password" for invalid credentials error', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      error: { message: 'Invalid login credentials', status: 400, name: 'AuthApiError' },
    });
    const { getByLabelText, getByText } = render(<LoginScreen />);
    fireEvent.changeText(getByLabelText('Email address'), 'user@example.com');
    fireEvent.changeText(getByLabelText('Password'), 'wrong');
    fireEvent.press(getByLabelText('Log In'));
    await waitFor(() => {
      expect(getByText('Invalid email or password')).toBeTruthy();
    });
  });

  it('shows rate limit message for 429 status', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      error: { message: 'Request rate limit exceeded', status: 429, name: 'AuthApiError' },
    });
    const { getByLabelText, getByText } = render(<LoginScreen />);
    fireEvent.changeText(getByLabelText('Email address'), 'user@example.com');
    fireEvent.changeText(getByLabelText('Password'), 'pass');
    fireEvent.press(getByLabelText('Log In'));
    await waitFor(() => {
      expect(getByText('Too many attempts. Please wait before trying again.')).toBeTruthy();
    });
  });

  it('shows connection error for fetch errors', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      error: { message: 'fetch failed', status: 0, name: 'FetchError' },
    });
    const { getByLabelText, getByText } = render(<LoginScreen />);
    fireEvent.changeText(getByLabelText('Email address'), 'user@example.com');
    fireEvent.changeText(getByLabelText('Password'), 'pass');
    fireEvent.press(getByLabelText('Log In'));
    await waitFor(() => {
      expect(getByText('Connection error. Check your internet and try again.')).toBeTruthy();
    });
  });

  it('navigates to forgot-password on link press', () => {
    const { getByLabelText } = render(<LoginScreen />);
    fireEvent.press(getByLabelText('Forgot password'));
    expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/forgot-password');
  });

  it('navigates to signup on sign up link press', () => {
    const { getByLabelText } = render(<LoginScreen />);
    fireEvent.press(getByLabelText('Sign up'));
    expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/signup');
  });
});

// ---------------------------------------------------------------------------
// T-8: Signup Screen
// ---------------------------------------------------------------------------

describe('SignupScreen', () => {
  it('renders email and password inputs', () => {
    const { getByLabelText } = render(<SignupScreen />);
    expect(getByLabelText('Email address')).toBeTruthy();
    expect(getByLabelText('Password')).toBeTruthy();
  });

  it('shows email validation error for invalid email', async () => {
    const { getByLabelText, getByText } = render(<SignupScreen />);
    fireEvent.changeText(getByLabelText('Email address'), 'bad');
    fireEvent.press(getByLabelText('Sign up'));
    await waitFor(() => {
      expect(getByText('Enter a valid email address')).toBeTruthy();
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('shows password length error when password < 8 chars', async () => {
    const { getByLabelText, getByText } = render(<SignupScreen />);
    fireEvent.changeText(getByLabelText('Email address'), 'user@example.com');
    fireEvent.changeText(getByLabelText('Password'), 'short');
    fireEvent.press(getByLabelText('Sign up'));
    await waitFor(() => {
      expect(getByText('Password must be at least 8 characters')).toBeTruthy();
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('calls signUp and navigates to onboarding on success', async () => {
    mockSignUp.mockResolvedValueOnce({ error: null });
    const { getByLabelText } = render(<SignupScreen />);
    fireEvent.changeText(getByLabelText('Email address'), 'user@example.com');
    fireEvent.changeText(getByLabelText('Password'), 'password123');
    fireEvent.press(getByLabelText('Sign up'));
    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
      });
      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/onboarding');
    });
  });

  it('shows network error message when fetch fails', async () => {
    mockSignUp.mockResolvedValueOnce({
      error: { message: 'fetch failed', status: 0, name: 'FetchError' },
    });
    const { getByLabelText, getByText } = render(<SignupScreen />);
    fireEvent.changeText(getByLabelText('Email address'), 'user@example.com');
    fireEvent.changeText(getByLabelText('Password'), 'password123');
    fireEvent.press(getByLabelText('Sign up'));
    await waitFor(() => {
      expect(getByText('Connection error. Check your internet and try again.')).toBeTruthy();
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('navigates to login on link press', () => {
    const { getByLabelText } = render(<SignupScreen />);
    fireEvent.press(getByLabelText('Log in'));
    expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/login');
  });
});

// ---------------------------------------------------------------------------
// T-9: OTP Screen
// ---------------------------------------------------------------------------

describe('OtpScreen', () => {
  it('renders phone input on step 1', () => {
    const { getByLabelText } = render(<OtpScreen />);
    expect(getByLabelText('Phone number')).toBeTruthy();
  });

  it('shows error for invalid phone number', async () => {
    const { getByLabelText, getByText } = render(<OtpScreen />);
    fireEvent.changeText(getByLabelText('Phone number'), '12345');
    fireEvent.press(getByText('Send code'));
    await waitFor(() => {
      expect(
        getByText('Enter a valid phone number with country code (e.g., +1234567890)')
      ).toBeTruthy();
    });
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('advances to step 2 after successful OTP send', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ error: null });
    const { getByLabelText, getByText } = render(<OtpScreen />);
    fireEvent.changeText(getByLabelText('Phone number'), '+12345678901');
    fireEvent.press(getByText('Send code'));
    await waitFor(() => {
      expect(getByText('Enter verification code')).toBeTruthy();
      expect(getByLabelText('Verification code')).toBeTruthy();
    });
  });

  it('calls verifyOtp on step 2 submission', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ error: null });
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'user-1' }, session: null },
      error: null,
    });
    const { getByLabelText, getByText } = render(<OtpScreen />);

    // Step 1
    fireEvent.changeText(getByLabelText('Phone number'), '+12345678901');
    fireEvent.press(getByText('Send code'));
    await waitFor(() => getByLabelText('Verification code'));

    // Step 2
    fireEvent.changeText(getByLabelText('Verification code'), '123456');
    fireEvent.press(getByText('Verify'));
    await waitFor(() => {
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        phone: '+12345678901',
        token: '123456',
        type: 'sms',
      });
    });
  });

  it('shows error on invalid OTP code', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ error: null });
    mockVerifyOtp.mockResolvedValueOnce({
      error: { message: 'Token has expired or is invalid' },
    });
    const { getByLabelText, getByText } = render(<OtpScreen />);

    fireEvent.changeText(getByLabelText('Phone number'), '+12345678901');
    fireEvent.press(getByText('Send code'));
    await waitFor(() => getByLabelText('Verification code'));

    fireEvent.changeText(getByLabelText('Verification code'), '000000');
    fireEvent.press(getByText('Verify'));
    await waitFor(() => {
      expect(getByText('Invalid or expired code. Request a new one.')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// T-10: Forgot Password Screen
// ---------------------------------------------------------------------------

describe('ForgotPasswordScreen', () => {
  it('renders email input', () => {
    const { getByLabelText } = render(<ForgotPasswordScreen />);
    expect(getByLabelText('Email address')).toBeTruthy();
  });

  it('shows email validation error for invalid email', async () => {
    const { getByLabelText, getByText } = render(<ForgotPasswordScreen />);
    fireEvent.changeText(getByLabelText('Email address'), 'notvalid');
    fireEvent.press(getByText('Send reset email'));
    await waitFor(() => {
      expect(getByText('Enter a valid email address')).toBeTruthy();
    });
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('calls resetPasswordForEmail and shows success message', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });
    const { getByLabelText, getByText } = render(<ForgotPasswordScreen />);
    fireEvent.changeText(getByLabelText('Email address'), 'user@example.com');
    fireEvent.press(getByText('Send reset email'));
    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('user@example.com');
      expect(getByText('Password reset email sent. Check your inbox.')).toBeTruthy();
    });
  });

  it('still shows success message even when API errors (enumeration prevention)', async () => {
    mockResetPasswordForEmail.mockRejectedValueOnce(new Error('Network error'));
    const { getByLabelText, getByText } = render(<ForgotPasswordScreen />);
    fireEvent.changeText(getByLabelText('Email address'), 'unknown@example.com');
    fireEvent.press(getByText('Send reset email'));
    await waitFor(() => {
      expect(getByText('Password reset email sent. Check your inbox.')).toBeTruthy();
    });
  });

  it('navigates to login on back link press', () => {
    const { getByLabelText } = render(<ForgotPasswordScreen />);
    fireEvent.press(getByLabelText('Back to login'));
    expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/login');
  });
});
