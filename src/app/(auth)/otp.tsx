import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { KHATM_COLORS } from '@/features/khatm/constants';

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;
const COUNTDOWN_SECONDS = 60;

export default function OtpScreen() {
  const isDark = useColorScheme() === 'dark';
  const bg = isDark ? '#121212' : '#FFFFFF';
  const textColor = isDark ? '#E5E7EB' : '#1F2937';
  const inputBorder = isDark ? '#374151' : '#D1D5DB';
  const inputBg = isDark ? '#1F2937' : '#FFFFFF';
  const errorColor = isDark ? '#F87171' : '#DC2626';

  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCountdown() {
    setCountdown(COUNTDOWN_SECONDS);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // Clear the countdown interval on unmount only. (Clearing on [step] change
  // would kill the timer startCountdown just created when moving to step 2 —
  // startCountdown already clears any prior interval itself.)
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function handleSendOtp() {
    setError('');

    if (!PHONE_REGEX.test(phone.trim())) {
      setError('Enter a valid phone number with country code (e.g., +1234567890)');
      return;
    }

    setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: phone.trim(),
    });
    setLoading(false);

    if (otpError) {
      setError(otpError.message || 'Failed to send code. Try again.');
      return;
    }

    setStep(2);
    startCountdown();
  }

  async function handleResend() {
    setError('');
    setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: phone.trim(),
    });
    setLoading(false);

    if (otpError) {
      setError(otpError.message || 'Failed to resend code. Try again.');
      return;
    }

    startCountdown();
  }

  async function handleVerify() {
    setError('');
    setLoading(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone: phone.trim(),
      token: code,
      type: 'sms',
    });

    if (verifyError) {
      setLoading(false);
      setError('Invalid or expired code. Request a new one.');
      return;
    }

    // Navigate explicitly — the auth listener in _layout.tsx only updates
    // store state. Route by onboarding status (profile row exists → tabs).
    const userId = data.user?.id ?? data.session?.user.id;
    const { data: profile } = userId
      ? await supabase.from('user_profiles').select('id').eq('id', userId).maybeSingle()
      : { data: null };
    router.replace(profile ? '/(tabs)' : '/(auth)/onboarding');
  }

  if (step === 1) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <Text style={[styles.title, { color: textColor }]}>Sign in with phone</Text>

        <TextInput
          style={[styles.input, { borderColor: inputBorder, backgroundColor: inputBg, color: textColor }]}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          accessibilityLabel="Phone number"
          placeholder="+1234567890"
          placeholderTextColor="#999"
        />

        {error ? <Text style={[styles.error, { color: errorColor }]}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: KHATM_COLORS.primary }, loading && styles.buttonDisabled]}
          onPress={handleSendOtp}
          disabled={loading}
          accessibilityLabel="Send code"
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Send code</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: textColor }]}>Enter verification code</Text>
      <Text style={styles.subtitle}>Code sent to {phone}</Text>

      <TextInput
        style={[styles.input, { borderColor: inputBorder, backgroundColor: inputBg, color: textColor }]}
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        accessibilityLabel="Verification code"
        placeholder="000000"
        placeholderTextColor="#999"
      />

      {error ? <Text style={[styles.error, { color: errorColor }]}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, { backgroundColor: KHATM_COLORS.primary }, loading && styles.buttonDisabled]}
        onPress={handleVerify}
        disabled={loading}
        accessibilityLabel="Verify code"
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Verify</Text>
        )}
      </TouchableOpacity>

      {countdown > 0 ? (
        <Text style={styles.countdown}>Resend code in {countdown}s</Text>
      ) : (
        <TouchableOpacity
          style={styles.link}
          onPress={handleResend}
          disabled={loading}
          accessibilityLabel="Resend code"
        >
          <Text style={[styles.linkText, { color: isDark ? '#5EEAD4' : '#0D9488' }]}>Resend code</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#555',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    minHeight: 44,
  },
  error: {
    marginBottom: 12,
    fontSize: 14,
  },
  button: {
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    minHeight: 44,
    minWidth: 44,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  countdown: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    marginTop: 4,
  },
  link: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  linkText: {
    fontSize: 15,
  },
});
