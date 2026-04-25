-- Phase 7b: per-workspace AI categorization instructions
-- Run once in Supabase SQL Editor.

alter table public.workspaces
  add column if not exists ai_categorization_instructions text;
