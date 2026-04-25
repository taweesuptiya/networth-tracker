-- Phase 2 migration: per-workspace FX rate
-- Run this once in Supabase SQL Editor.

alter table public.workspaces
  add column if not exists usd_to_thb numeric not null default 32.33;
