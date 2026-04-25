-- Phase 5b: snapshot budgets per month so projection (forecast) and budget (frozen baseline) can diverge.
-- Run once in Supabase SQL Editor.

create table if not exists public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  month date not null, -- first day of month, e.g. 2026-01-01
  income_budget numeric not null default 0,
  expense_budget numeric not null default 0,
  net_save_budget numeric not null default 0,
  total_networth_budget numeric not null default 0,
  expense_lines jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, month)
);

create index if not exists monthly_budgets_workspace_month_idx
  on public.monthly_budgets(workspace_id, month);

alter table public.monthly_budgets enable row level security;

drop policy if exists "mb ws scope select" on public.monthly_budgets;
drop policy if exists "mb ws scope write" on public.monthly_budgets;
create policy "mb ws scope select" on public.monthly_budgets
  for select using (public.owns_workspace(workspace_id));
create policy "mb ws scope write" on public.monthly_budgets
  for all using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));
