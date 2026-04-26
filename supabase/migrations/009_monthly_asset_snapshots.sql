-- Phase 8: per-asset monthly snapshots so we can chart investment movement
-- and backfill historical prices.

create table if not exists public.monthly_asset_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  month date not null, -- first day of the month (YYYY-MM-01)
  price numeric,        -- end-of-month price per unit (NULL for manual-valued assets)
  units numeric,        -- snapshot of units held at the time
  value numeric not null, -- price * units (or manual_value)
  currency text not null,
  source text not null default 'manual'
    check (source in ('yahoo','finnomena','manual','estimated')),
  created_at timestamptz not null default now(),
  unique (workspace_id, asset_id, month)
);

create index if not exists mas_workspace_month_idx
  on public.monthly_asset_snapshots(workspace_id, month);
create index if not exists mas_asset_month_idx
  on public.monthly_asset_snapshots(asset_id, month);

alter table public.monthly_asset_snapshots enable row level security;

drop policy if exists "mas ws scope select" on public.monthly_asset_snapshots;
drop policy if exists "mas ws scope write" on public.monthly_asset_snapshots;
create policy "mas ws scope select" on public.monthly_asset_snapshots
  for select using (public.owns_workspace(workspace_id));
create policy "mas ws scope write" on public.monthly_asset_snapshots
  for all using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));
