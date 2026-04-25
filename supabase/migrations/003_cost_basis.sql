-- Add cost basis to track gain/loss per asset
alter table public.assets
  add column if not exists cost_basis numeric;

comment on column public.assets.cost_basis is
  'Original cost value in the asset''s own currency (e.g., 160000 THB for K-FIRMF). NULL = unknown.';
