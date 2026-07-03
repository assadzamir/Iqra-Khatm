import { Redirect } from 'expo-router';
import { useAuthStore } from '@/features/auth/store';
import { ActivityIndicator, View } from 'react-native';

export default function AuthIndex() {
  const { session, profile, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (session && profile) return <Redirect href="/(tabs)" />;
  if (session && !profile) return <Redirect href="/(auth)/onboarding" />;
  return <Redirect href="/(auth)/login" />;
}
