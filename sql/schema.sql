-- =============================================
-- Study Buddy — Supabase SQL Schema
-- Run this in: Supabase Dashboard → SQL Editor
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
