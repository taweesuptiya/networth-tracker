-- Link each account to an asset so statement uploads auto-update NW balance
alter table public.accounts
  add column if not exists linked_asset_id uuid references public.assets(id) on delete set null;
