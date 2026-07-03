// Auth feature shared types
// Derived from supabase/migrations/005_auth_reader_email.sql user_profiles table

export type UserProfile = {
  id: string;           // uuid — same as auth.users.id
  display_name: string;
  created_at: string;   // ISO 8601 timestamptz string
  updated_at: string;   // ISO 8601 timestamptz string
};
