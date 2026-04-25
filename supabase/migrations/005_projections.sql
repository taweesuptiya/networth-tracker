-- Phase 5: net worth projection per workspace
-- Run once in Supabase SQL Editor.

create table if not exists public.projections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.projections enable row level security;

drop policy if exists "proj ws scope select" on public.projections;
drop policy if exists "proj ws scope write" on public.projections;
create policy "proj ws scope select" on public.projections
  for select using (public.owns_workspace(workspace_id));
create policy "proj ws scope write" on public.projections
  for all using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));
