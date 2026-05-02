-- =============================================
-- Study Buddy — Supabase SQL Schema
-- Run this in your Supabase project's SQL Editor
-- Dashboard → SQL Editor → New Query → paste & run
-- =============================================

CREATE TABLE IF NOT EXISTS study_progress (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email   TEXT UNIQUE NOT NULL,
  chapters     JSONB NOT NULL DEFAULT '{}',
  settings     JSONB NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Disable RLS (fine for a personal/trusted app where
-- the anon key is kept private via Netlify env vars)
ALTER TABLE study_progress DISABLE ROW LEVEL SECURITY;

-- Optional: auto-update the updated_at timestamp
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
