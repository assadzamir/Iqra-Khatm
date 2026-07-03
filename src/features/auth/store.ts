import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '@/features/auth/types';
import { supabase } from '@/lib/supabase';

interface AuthStore {
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setIsLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()((set) => ({
  session: null,
  profile: null,
  isLoading: true,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  signOut: async () => {
    // Calls supabase.auth.signOut() — the SIGNED_OUT event in _layout.tsx
    // onAuthStateChange listener handles clearing the store, queryClient, and MMKV.
    await supabase.auth.signOut();
  },
}));
