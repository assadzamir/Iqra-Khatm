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

export default function ForgotPasswordScreen() {
  const isDark = useColorScheme() === 'dark';
  const bg = isDark ? '#121212' : '#FFFFFF';
  const textColor = isDark ? '#E5E7EB' : '#1F2937';
  const inputBorder = isDark ? '#374151' : '#D1D5DB';
  const inputBg = isDark ? '#1F2937' : '#FFFFFF';
  const errorColor = isDark ? '#F87171' : '#DC2626';

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setEmailError('');
    setMessage('');

    if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError('Enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(email.trim());
    } catch {
      // Silently catch all errors — always show success message
    }
    setLoading(false);

    // Always show success regardless of whether email exists (prevents enumeration)
    setMessage('Password reset email sent. Check your inbox.');
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: textColor }]}>Forgot password</Text>

      <TextInput
        style={[styles.input, { borderColor: inputBorder, backgroundColor: inputBg, color: textColor }]}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        accessibilityLabel="Email address"
        placeholder="Email"
        placeholderTextColor="#999"
      />

      {emailError ? <Text style={[styles.error, { color: errorColor }]}>{emailError}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      <TouchableOpacity
        style={[styles.button, { backgroundColor: KHATM_COLORS.primary }, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
        accessibilityLabel="Send reset email"
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Send reset email</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.link}
        onPress={() => router.push('/(auth)/login')}
        accessibilityLabel="Back to login"
      >
        <Text style={[styles.linkText, { color: isDark ? '#5EEAD4' : '#0D9488' }]}>Back to login</Text>
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
  success: {
    color: '#2e7d32',
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
