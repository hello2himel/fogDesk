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

-- =============================================
-- Final Revision Planner — schema
-- =============================================
-- One row per (user, subject). subject_key matches the
-- "subjectKey" field in /config/revision/<plan>.json (e.g. "math-hsc-science").
--
-- entries is the generated day-by-day plan, stored as JSONB so ticking
-- a box is a single cheap update with no schema migration needed if the
-- plan shape changes later. Each entry looks like:
--   {
--     "id": "math-hsc-science-3",     -- stable id: subjectKey + chapter index
--     "date": "2025-01-12",
--     "chapterIndex": 2,
--     "chapterTitle": "Circle",
--     "subtitle": "বৃত্ত",
--     "paper": "1st Paper",
--     "difficulty": "Medium",
--     "type": "concept" | "problems" | "revision" | "final",
--     "done": false
--   }
-- =============================================

CREATE TABLE IF NOT EXISTS revision_progress (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_key TEXT NOT NULL,
  start_date  DATE NOT NULL,
  entries     JSONB NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, subject_key)
);

ALTER TABLE revision_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own revision rows"   ON revision_progress;
DROP POLICY IF EXISTS "Users can insert own revision rows" ON revision_progress;
DROP POLICY IF EXISTS "Users can update own revision rows" ON revision_progress;
DROP POLICY IF EXISTS "Users can delete own revision rows" ON revision_progress;

CREATE POLICY "Users can read own revision rows"
  ON revision_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own revision rows"
  ON revision_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own revision rows"
  ON revision_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own revision rows"
  ON revision_progress FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER trg_revision_progress_updated_at
  BEFORE UPDATE ON revision_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Speeds up "today's revision" widget + per-subject lookups
CREATE INDEX IF NOT EXISTS idx_revision_progress_user_subject
  ON revision_progress (user_id, subject_key);

-- Delete a user's account also removes their revision plans (defence in
-- depth — ON DELETE CASCADE on user_id already handles this, but the
-- explicit delete keeps delete_account() self-documenting).
CREATE OR REPLACE FUNCTION delete_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM study_progress     WHERE user_id = _uid;
  DELETE FROM revision_progress  WHERE user_id = _uid;
  DELETE FROM auth.users WHERE id = _uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_account() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION delete_account() TO authenticated;
