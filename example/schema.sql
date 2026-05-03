-- =============================================
-- Fogdesk — Supabase SQL Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- Safe to re-run: all statements are idempotent
-- =============================================

-- 1. Create the table (uses auth.uid() — tied to Supabase Auth)
CREATE TABLE IF NOT EXISTS study_progress (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapters    JSONB NOT NULL DEFAULT '{}',
  settings    JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE study_progress ENABLE ROW LEVEL SECURITY;

-- 3. Policy: users can only read/write their own row
--    DROP IF EXISTS makes this safe to re-run (CREATE POLICY has no OR REPLACE)
DROP POLICY IF EXISTS "Users can read own row"   ON study_progress;
DROP POLICY IF EXISTS "Users can insert own row"  ON study_progress;
DROP POLICY IF EXISTS "Users can update own row"  ON study_progress;

CREATE POLICY "Users can read own row"
  ON study_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own row"
  ON study_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own row"
  ON study_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Auto-update updated_at on every write
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_study_progress_updated_at
  BEFORE UPDATE ON study_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Supabase Auth settings (do in Dashboard UI)
-- =============================================
-- Authentication → Providers → Email:
--   ✅ Enable email provider
--   ✅ Enable email confirmations  ← sends the OTP
--   ✅ Secure email change
--   OTP expiry: 3600 (1 hour) recommended
--
-- Authentication → URL Configuration:
--   Site URL: https://yourapp.netlify.app
-- =============================================

-- =============================================
-- Username storage
-- =============================================
-- Usernames are stored in Supabase Auth user_metadata
-- as { username: "..." } — no extra table is needed.
--
-- Set via:
--   supabase.auth.updateUser({ data: { username: newUsername } })
--
-- Read via:
--   user.user_metadata?.username
--
-- Username validation (3–20 chars, letters/numbers/underscores)
-- is enforced client-side in settings.js changeUsername().
-- =============================================

-- =============================================
-- Account self-deletion RPC
-- =============================================
-- The Supabase client SDK cannot delete a user's own auth row directly.
-- This function runs as the authenticated user (via auth.uid()) and
-- deletes both their study_progress row and their auth account.
--
-- Run this in: Supabase Dashboard → SQL Editor
-- =============================================

CREATE OR REPLACE FUNCTION delete_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  -- Guard: only a signed-in user can delete themselves
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete study progress (also cascades via FK, but explicit is clear)
  DELETE FROM study_progress WHERE user_id = _uid;

  -- Delete the auth account itself
  DELETE FROM auth.users WHERE id = _uid;
END;
$$;

-- Grant execute to authenticated users only
REVOKE EXECUTE ON FUNCTION delete_account() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION delete_account() TO authenticated;
