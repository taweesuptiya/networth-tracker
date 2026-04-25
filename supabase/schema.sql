-- ============================================================
-- Net Worth Tracker — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- 1. Workspaces (Personal + Marriage per user)
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  base_currency text not null default 'THB',
  created_at timestamptz not null default now()
);

create index if not exists workspaces_user_id_idx on public.workspaces(user_id);

-- 2. Assets within a workspace
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  -- Asset type matches Excel categories: Stock, Fund (RMF/SSF/PVD), Cash, House
  type text not null check (type in ('Stock','Fund','Cash','House','Crypto','Other')),
  -- Optional ticker / fund code for auto-pricing
  symbol text,
  -- Where to fetch price from: 'yahoo', 'finnomena', 'manual'
  price_source text not null default 'manual' check (price_source in ('yahoo','finnomena','manual')),
  units numeric,
  price_per_unit numeric,
  manual_value numeric,
  currency text not null default 'THB',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assets_workspace_idx on public.assets(workspace_id);

-- 3. Price history snapshots (for charts + audit)
create table if not exists public.price_history (
  id bigserial primary key,
  asset_id uuid not null references public.assets(id) on delete cascade,
  price numeric not null,
  currency text not null,
  fx_to_base numeric,
  recorded_at timestamptz not null default now()
);

create index if not exists price_history_asset_recorded_idx
  on public.price_history(asset_id, recorded_at desc);

-- 4. Net-worth snapshots (daily aggregate per workspace, for trend charts)
create table if not exists public.networth_snapshots (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  total_value numeric not null,
  currency text not null default 'THB',
  recorded_at timestamptz not null default now()
);

create index if not exists snapshots_workspace_recorded_idx
  on public.networth_snapshots(workspace_id, recorded_at desc);

-- 5. Transactions ingested from PDF statements
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  occurred_at date not null,
  description text,
  amount numeric not null,
  currency text not null default 'THB',
  -- 'credit' (money in) or 'debit' (money out)
  direction text not null check (direction in ('credit','debit')),
  category text,
  source_statement_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists tx_workspace_date_idx
  on public.transactions(workspace_id, occurred_at desc);

-- 6. Uploaded statements (raw PDF references)
create table if not exists public.statements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  parsed_at timestamptz,
  status text not null default 'uploaded' check (status in ('uploaded','parsing','parsed','failed')),
  parse_error text,
  created_at timestamptz not null default now()
);

create index if not exists statements_workspace_idx on public.statements(workspace_id);

-- ============================================================
-- Row Level Security: each user only sees their own workspaces
-- ============================================================

alter table public.workspaces enable row level security;
alter table public.assets enable row level security;
alter table public.price_history enable row level security;
alter table public.networth_snapshots enable row level security;
alter table public.transactions enable row level security;
alter table public.statements enable row level security;

-- Workspaces: owner-only
drop policy if exists "ws own select" on public.workspaces;
drop policy if exists "ws own insert" on public.workspaces;
drop policy if exists "ws own update" on public.workspaces;
drop policy if exists "ws own delete" on public.workspaces;
create policy "ws own select" on public.workspaces for select using (auth.uid() = user_id);
create policy "ws own insert" on public.workspaces for insert with check (auth.uid() = user_id);
create policy "ws own update" on public.workspaces for update using (auth.uid() = user_id);
create policy "ws own delete" on public.workspaces for delete using (auth.uid() = user_id);

-- Helper: a user owns a workspace if they appear in workspaces.user_id
create or replace function public.owns_workspace(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspaces w where w.id = ws and w.user_id = auth.uid());
$$;

-- Assets, history, snapshots, transactions, statements: scoped via workspace ownership
do $$
declare t text;
begin
  for t in select unnest(array['assets','networth_snapshots','transactions','statements']) loop
    execute format('drop policy if exists "%s ws scope select" on public.%I', t, t);
    execute format('drop policy if exists "%s ws scope write"  on public.%I', t, t);
    execute format('create policy "%s ws scope select" on public.%I for select using (public.owns_workspace(workspace_id))', t, t);
    execute format('create policy "%s ws scope write"  on public.%I for all    using (public.owns_workspace(workspace_id)) with check (public.owns_workspace(workspace_id))', t, t);
  end loop;
end $$;

-- price_history is keyed by asset_id, not workspace_id
drop policy if exists "ph asset scope select" on public.price_history;
drop policy if exists "ph asset scope write"  on public.price_history;
create policy "ph asset scope select" on public.price_history for select
  using (exists (select 1 from public.assets a join public.workspaces w on w.id = a.workspace_id
                 where a.id = price_history.asset_id and w.user_id = auth.uid()));
create policy "ph asset scope write" on public.price_history for all
  using (exists (select 1 from public.assets a join public.workspaces w on w.id = a.workspace_id
                 where a.id = price_history.asset_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.assets a join public.workspaces w on w.id = a.workspace_id
                      where a.id = price_history.asset_id and w.user_id = auth.uid()));

-- ============================================================
-- Auto-bootstrap: when a new user signs up, create Personal + Marriage workspaces
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspaces (user_id, name) values (new.id, 'Personal');
  insert into public.workspaces (user_id, name) values (new.id, 'Marriage');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
