-- Seed your current Excel data into both workspaces.
-- Run this AFTER you've signed up and the workspaces exist.
-- Safe to run multiple times: deletes existing assets first per workspace.

-- ============================================================
-- PERSONAL workspace
-- ============================================================
do $$
declare
  ws uuid;
begin
  select id into ws from public.workspaces
    where user_id = auth.uid() and name = 'Personal' limit 1;

  if ws is null then
    raise notice 'No Personal workspace found for current user.';
    return;
  end if;

  delete from public.assets where workspace_id = ws;

  insert into public.assets (workspace_id, name, type, symbol, price_source, units, price_per_unit, currency) values
    (ws, 'Grab shares', 'Stock', 'GRAB', 'yahoo', 4181, 3.9, 'USD');

  insert into public.assets (workspace_id, name, type, symbol, price_source, manual_value, currency, notes) values
    (ws, 'PVD (self)',     'Fund', null,         'manual', 528097,  'THB', 'Provident Fund — self contribution'),
    (ws, 'PVD (employer)', 'Fund', null,         'manual', 1056194, 'THB', 'Provident Fund — employer contribution'),
    (ws, 'SSF',            'Fund', null,         'manual', 190220,  'THB', null),
    (ws, 'Savings',        'Cash', null,         'manual', 120000,  'THB', null);

  -- RMF breakdown from Excel (sum ~400K)
  insert into public.assets (workspace_id, name, type, symbol, price_source, manual_value, currency, notes) values
    (ws, 'RMF Bond — K-FIRMF',         'Fund', 'K-FIRMF',     'finnomena', 160000, 'THB', '40% RMF'),
    (ws, 'RMF AI Tech — TAIRMF-A',     'Fund', 'TAIRMF-A',    'finnomena', 120000, 'THB', '30% RMF'),
    (ws, 'RMF India — K-INDIARMF',     'Fund', 'K-INDIARMF',  'finnomena',  60000, 'THB', '15% RMF'),
    (ws, 'RMF Ark — ES-GINNORMF',      'Fund', 'ES-GINNORMF', 'finnomena',  60000, 'THB', '15% RMF'),
    (ws, 'Thai ESG — KKP GB THAI ESG', 'Fund', 'KKP-GB-THAI-ESG', 'finnomena', 300000, 'THB', null);
end $$;

-- ============================================================
-- MARRIAGE workspace
-- ============================================================
do $$
declare
  ws uuid;
begin
  select id into ws from public.workspaces
    where user_id = auth.uid() and name = 'Marriage' limit 1;

  if ws is null then
    raise notice 'No Marriage workspace found for current user.';
    return;
  end if;

  delete from public.assets where workspace_id = ws;

  insert into public.assets (workspace_id, name, type, price_source, manual_value, currency) values
    (ws, 'Condo',   'House', 'manual', 2909000, 'THB'),
    (ws, 'Savings', 'Cash',  'manual',  862114, 'THB');
end $$;
