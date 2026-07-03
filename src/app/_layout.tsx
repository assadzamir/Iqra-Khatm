import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { mmkvStorage } from '@/lib/mmkv';
import { READER_MMKV_KEYS } from '@/features/quran-reader/types';
import { useAuthStore } from '@/features/auth/store';

const queryClient = new QueryClient();

export default function RootLayout() {
  const { isLoading, setSession, setProfile, setIsLoading } = useAuthStore();

  useEffect(() => {
    setIsLoading(true);

    // Restore any existing session on app launch
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        supabase
          .from('user_profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()
          .then(({ data }) => {
            setProfile(data ?? null);
            setIsLoading(false);
          });
      } else {
        setIsLoading(false);
      }
    }).catch(() => {
      // [T-5 AC-3] If getSession fails, still clear loading state
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setSession(session);
          if (session) {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', session.user.id)
              .maybeSingle();
            setProfile(profile ?? null);
          }
        } else if (event === 'SIGNED_OUT') {
          // [threat-model] US-2 AC-8: clear all user state on sign-out
          setSession(null);
          setProfile(null);
          queryClient.clear();
          mmkvStorage.removeItem(READER_MMKV_KEYS.pendingBookmarkOps);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
