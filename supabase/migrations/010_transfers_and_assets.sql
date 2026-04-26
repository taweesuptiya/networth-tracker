-- Phase 9: cross-workspace transfer pairing + asset purchase tracking
-- Run once in Supabase SQL Editor.

-- 1. Pair linkage + asset linkage on transactions
alter table public.transactions
  add column if not exists linked_tx_id uuid references public.transactions(id) on delete set null,
  add column if not exists target_workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists target_asset_id uuid references public.assets(id) on delete set null,
  add column if not exists units_delta numeric;

create index if not exists tx_linked_idx on public.transactions(linked_tx_id);
create index if not exists tx_target_asset_idx on public.transactions(target_asset_id);
create index if not exists tx_target_ws_idx on public.transactions(target_workspace_id);

-- 2. New tx_type values (transfer_in for paired credit; asset_buy for unit-increasing purchase)
alter table public.transactions drop constraint if exists transactions_tx_type_check;
alter table public.transactions add constraint transactions_tx_type_check
  check (tx_type in (
    'auto','income','expense','transfer','transfer_in',
    'cc_payment','cc_payment_received','reimbursement','asset_buy'
  ));
