-- Phase 6: accounts, classification rules, and tx_type/category on transactions.
-- Run once in Supabase SQL Editor.

-- 1. Accounts (per workspace): KBANK savings, UOB savings, KTC card, UOB card, etc.
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  type text not null check (type in ('savings','credit_card','cash')),
  last4 text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists accounts_workspace_idx on public.accounts(workspace_id);

alter table public.accounts enable row level security;

drop policy if exists "acc ws scope select" on public.accounts;
drop policy if exists "acc ws scope write" on public.accounts;
create policy "acc ws scope select" on public.accounts
  for select using (public.owns_workspace(workspace_id));
create policy "acc ws scope write" on public.accounts
  for all using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));

-- 2. Add account_id + tx_type to transactions
alter table public.transactions
  add column if not exists account_id uuid references public.accounts(id) on delete set null,
  add column if not exists tx_type text not null default 'auto'
    check (tx_type in ('auto','income','expense','transfer','cc_payment','cc_payment_received','reimbursement'));

-- 3. Categorization rules (applied at import time, first-match-wins by priority)
create table if not exists public.tx_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  priority int not null default 100,
  pattern text not null,
  match_type text not null default 'contains' check (match_type in ('contains','regex')),
  applies_to_account_type text not null default 'all' check (applies_to_account_type in ('all','savings','credit_card','cash')),
  applies_to_direction text not null default 'all' check (applies_to_direction in ('all','credit','debit')),
  set_tx_type text not null check (set_tx_type in ('income','expense','transfer','cc_payment','cc_payment_received','reimbursement')),
  set_category text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists tx_rules_workspace_priority_idx on public.tx_rules(workspace_id, priority);

alter table public.tx_rules enable row level security;

drop policy if exists "rule ws scope select" on public.tx_rules;
drop policy if exists "rule ws scope write" on public.tx_rules;
create policy "rule ws scope select" on public.tx_rules
  for select using (public.owns_workspace(workspace_id));
create policy "rule ws scope write" on public.tx_rules
  for all using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));
