import { useState } from 'react';
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapError(error: { status?: number; message?: string } | null): string {
  if (!error) return '';
  const msg = error.message ?? '';
  if (msg.includes('Invalid login credentials')) return 'Invalid email or password';
  if (error.status === 429 || msg.toLowerCase().includes('rate')) {
    return 'Too many attempts. Please wait before trying again.';
  }
  if (msg.toLowerCase().includes('fetch')) {
    return 'Connection error. Check your internet and try again.';
  }
  return msg || 'An unexpected error occurred.';
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isDark = useColorScheme() === 'dark';
  const bg = isDark ? '#121212' : '#FFFFFF';
  const textColor = isDark ? '#E5E7EB' : '#1F2937';
  const inputBorder = isDark ? '#374151' : '#D1D5DB';
  const inputBg = isDark ? '#1F2937' : '#FFFFFF';
  const errorColor = isDark ? '#F87171' : '#DC2626';

  async function handleSubmit() {
    setError('');

    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }

    setLoading(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setLoading(false);
      console.warn('[auth] login failed:', authError.status, authError.name);
      setError(mapError(authError));
      return;
    }

    // Navigate explicitly — the auth listener in _layout.tsx only updates
    // store state. Route by onboarding status (profile row exists → tabs).
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();
    router.replace(profile ? '/(tabs)' : '/(auth)/onboarding');
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: textColor }]}>Log in</Text>

      <TextInput
        style={[styles.input, { borderColor: inputBorder, backgroundColor: inputBg, color: textColor }]}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        accessibilityLabel="Email address"
        placeholder="Email"
        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
      />

      <TextInput
        style={[styles.input, { borderColor: inputBorder, backgroundColor: inputBg, color: textColor }]}
        value={password}
        onChangeText={setPassword}
        secureTextEntry={true}
        accessibilityLabel="Password"
        placeholder="Password"
        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
      />

      {error ? <Text style={[styles.error, { color: errorColor }]}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, { backgroundColor: KHATM_COLORS.primary }, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
        accessibilityLabel="Log In"
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Log In</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.link}
        onPress={() => router.push('/(auth)/forgot-password')}
        accessibilityLabel="Forgot password"
      >
        <Text style={[styles.linkText, { color: isDark ? '#5EEAD4' : '#0D9488' }]}>Forgot password?</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.link}
        onPress={() => router.push('/(auth)/signup')}
        accessibilityLabel="Sign up"
      >
        <Text style={[styles.linkText, { color: isDark ? '#5EEAD4' : '#0D9488' }]}>Sign up</Text>
      </TouchableOpacity>
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
    marginBottom: 32,
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
