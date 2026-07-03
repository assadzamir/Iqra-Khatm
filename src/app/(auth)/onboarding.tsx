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
import { router, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store';
import { KHATM_COLORS } from '@/features/khatm/constants';

export default function OnboardingScreen() {
  const isDark = useColorScheme() === 'dark';
  const bg = isDark ? '#121212' : '#FFFFFF';
  const textColor = isDark ? '#E5E7EB' : '#1F2937';
  const inputBorder = isDark ? '#374151' : '#D1D5DB';
  const inputBg = isDark ? '#1F2937' : '#FFFFFF';
  const errorColor = isDark ? '#F87171' : '#DC2626';

  const session = useAuthStore((s) => s.session);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!session) {
    router.replace('/(auth)/login');
    return null;
  }

  const validate = (): boolean => {
    const trimmed = displayName.trim();
    if (trimmed.length < 2 || trimmed.length > 50) {
      setError('Display name must be between 2 and 50 characters');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    const { data, error: insertError } = await supabase
      .from('user_profiles')
      .insert({ id: session.user.id, display_name: displayName.trim() })
      .select()
      .single();

    if (insertError || !data) {
      setError('Could not save your name. Check your connection and try again.');
      setIsSubmitting(false);
      return;
    }

    useAuthStore.getState().setProfile(data);
    router.replace('/(tabs)');
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Stack.Screen options={{ headerBackVisible: false, gestureEnabled: false }} />
      <Text style={[styles.title, { color: textColor }]}>Welcome! Set your display name</Text>
      <TextInput
        style={[styles.input, { borderColor: inputBorder, backgroundColor: inputBg, color: textColor }]}
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={50}
        autoCapitalize="words"
        accessibilityLabel="Display name"
        placeholder="Your name"
        editable={!isSubmitting}
      />
      {error ? <Text style={[styles.errorText, { color: errorColor }]}>{error}</Text> : null}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: KHATM_COLORS.primary }]}
        onPress={handleSubmit}
        disabled={isSubmitting}
        accessibilityLabel="Continue"
      >
        {isSubmitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Continue</Text>
        )}
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
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
    minHeight: 44,
  },
  errorText: {
    fontSize: 14,
    marginBottom: 12,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
