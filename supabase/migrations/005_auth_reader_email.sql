-- -----------------------------------------------------------------------
-- New table: user_profiles (one row per auth user, created at onboarding)
-- -----------------------------------------------------------------------
CREATE TABLE user_profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name varchar(50) NOT NULL CHECK (char_length(display_name) >= 2),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_select_own" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "user_profiles_insert_own" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "user_profiles_update_own" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- -----------------------------------------------------------------------
-- New table: user_bookmarks (Quran page bookmarks per user)
-- -----------------------------------------------------------------------
CREATE TABLE user_bookmarks (
  id          uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_number smallint  NOT NULL CHECK (page_number BETWEEN 1 AND 604),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_bookmark UNIQUE (user_id, page_number)
);

CREATE INDEX idx_user_bookmarks_user ON user_bookmarks(user_id);

ALTER TABLE user_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_bookmarks_select_own" ON user_bookmarks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_bookmarks_insert_own" ON user_bookmarks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_bookmarks_delete_own" ON user_bookmarks
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------
-- ALTER khatm_participants: add email notification columns (additive only)
-- Existing rows: email = NULL (no emails sent), email_notifications_enabled = true
-- -----------------------------------------------------------------------
ALTER TABLE khatm_participants
  ADD COLUMN IF NOT EXISTS email                      varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean     NOT NULL DEFAULT true;

-- Backfill: existing participants already store their email in contact_value
UPDATE khatm_participants
SET email = contact_value
WHERE email IS NULL
  AND contact_type = 'EMAIL'
  AND contact_value <> '';
