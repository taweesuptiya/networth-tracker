-- Rebuild Personal workspace with real units + NAV from finnomena, plus cost basis.
-- Replace the UID below with your User UID.

do $$
declare
  my_uid uuid := '00000000-0000-0000-0000-000000000000'; -- <<< REPLACE
  ws uuid;
begin
  if my_uid = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Replace my_uid with your real Supabase auth user UID first.';
  end if;

  select id into ws from public.workspaces
    where user_id = my_uid and name = 'Personal' limit 1;
  if ws is null then
    raise exception 'Personal workspace not found.';
  end if;

  delete from public.assets where workspace_id = ws;

  -- Stock (auto-priced via Yahoo) — cost basis unknown, leave null (edit in UI later)
  insert into public.assets (workspace_id, name, type, symbol, price_source, units, price_per_unit, currency, cost_basis) values
    (ws, 'Grab shares', 'Stock', 'GRAB', 'yahoo', 4181, 3.9, 'USD', null);

  -- PVD (manual — no NAV available)
  insert into public.assets (workspace_id, name, type, symbol, price_source, manual_value, currency, cost_basis, notes) values
    (ws, 'PVD (self)',     'Fund', null, 'manual', 528097,  'THB', null, 'Provident Fund — self contribution'),
    (ws, 'PVD (employer)', 'Fund', null, 'manual', 1056194, 'THB', null, 'Provident Fund — employer contribution');

  -- Cash savings
  insert into public.assets (workspace_id, name, type, price_source, manual_value, currency) values
    (ws, 'Savings', 'Cash', 'manual', 120000, 'THB');

  -- RMF — units × NAV with cost basis
  insert into public.assets (workspace_id, name, type, symbol, price_source, units, price_per_unit, currency, cost_basis, notes) values
    (ws, 'K-FIRMF',     'Fund', 'K-FIRMF',     'finnomena',  9124.8681, 17.5467, 'THB', 160000,    'RMF — Bond'),
    (ws, 'TAIRMF-A',    'Fund', 'TAIRMF-A',    'finnomena', 10059.6874, 13.0391, 'THB', 120000,    'RMF — AI & Big Data'),
    (ws, 'ES-GINNORMF', 'Fund', 'ES-GINNORMF', 'finnomena',  9073.5867,  6.4403, 'THB',  60000,    'RMF — Global Innovation'),
    (ws, 'K-INDIARMF',  'Fund', 'K-INDIARMF',  'finnomena',  5774.0054,  9.5994, 'THB',  60000,    'RMF — India');

  -- Thai ESG
  insert into public.assets (workspace_id, name, type, symbol, price_source, units, price_per_unit, currency, cost_basis, notes) values
    (ws, 'KKP GB THAI ESG', 'Fund', 'KKP GB THAI ESG', 'finnomena', 28895.5061, 11.0099, 'THB', 330000, 'Thai ESG — KKP Government Bond');

  -- SSF
  insert into public.assets (workspace_id, name, type, symbol, price_source, units, price_per_unit, currency, cost_basis, notes) values
    (ws, 'SCBNDQ(SSF)',  'Fund', 'SCBNDQ(SSF)',  'finnomena',  7466.8657, 14.2266, 'THB', 80000,    'SSF — US NDQ'),
    (ws, 'KFUSSSF',      'Fund', 'KFUSSSF',      'finnomena', 11360.1145,  5.8408, 'THB', 65659.19, 'SSF — US Equity'),
    (ws, 'SCBAUTO(SSF)', 'Fund', 'SCBAUTO(SSF)', 'finnomena',  1984.9146, 12.4759, 'THB', 20000,    'SSF — Autonomous Tech');

  -- Cash funds
  insert into public.assets (workspace_id, name, type, symbol, price_source, units, price_per_unit, currency, cost_basis, notes) values
    (ws, 'KFCASH-A', 'Fund', 'KFCASH-A', 'finnomena', 14.9665, 14.0370, 'THB', 200, 'Money market'),
    (ws, 'SCBSFF',   'Fund', 'SCBSFF',   'finnomena',  9.6173, 21.6952, 'THB', 200, 'Short-term bond');
end $$;
