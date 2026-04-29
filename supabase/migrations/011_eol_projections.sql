-- EOL (End-of-Life) projection config per workspace
create table if not exists public.eol_projections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.eol_projections enable row level security;

drop policy if exists "eol ws scope select" on public.eol_projections;
drop policy if exists "eol ws scope write" on public.eol_projections;
create policy "eol ws scope select" on public.eol_projections
  for select using (public.owns_workspace(workspace_id));
create policy "eol ws scope write" on public.eol_projections
  for all using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));
