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

export default function SignupScreen() {
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

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (authError && authError.message?.toLowerCase().includes('fetch')) {
      setError('Connection error. Check your internet and try again.');
      return;
    }

    // AC-7: always show this message regardless of outcome (email enumeration prevention)
    setError('Check your email to confirm your account.');
    router.replace('/(auth)/onboarding');
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: textColor }]}>Sign up</Text>

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
        accessibilityLabel="Sign up"
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign up</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.link}
        onPress={() => router.push('/(auth)/login')}
        accessibilityLabel="Log in"
      >
        <Text style={[styles.linkText, { color: isDark ? '#5EEAD4' : '#0D9488' }]}>Log in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 32 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 16, minHeight: 44 },
  error: { marginBottom: 12, fontSize: 14 },
  button: { borderRadius: 8, padding: 14, alignItems: 'center', minHeight: 44, minWidth: 44, marginBottom: 16 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  linkText: { fontSize: 15 },
});
