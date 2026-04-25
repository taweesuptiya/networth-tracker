-- Manual seed: replace the UID on the next line with YOUR user UID
-- (Supabase Dashboard → Authentication → Users → click your row → User UID).
-- Safe to re-run.

do $$
declare
  my_uid uuid := '7afb29c2-e915-45a7-b014-d9c55fc8fe0e';
  ws_personal uuid;
  ws_marriage uuid;
begin
  if my_uid = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Replace my_uid with your real Supabase auth user UID first.';
  end if;

  select id into ws_personal from public.workspaces
    where user_id = my_uid and name = 'Personal' limit 1;
  select id into ws_marriage from public.workspaces
    where user_id = my_uid and name = 'Marriage' limit 1;

  if ws_personal is null or ws_marriage is null then
    raise exception 'Could not find Personal/Marriage workspaces for that user. Sign in to the app first.';
  end if;

  -- Wipe existing assets in both
  delete from public.assets where workspace_id in (ws_personal, ws_marriage);

  -- Personal
  insert into public.assets (workspace_id, name, type, symbol, price_source, units, price_per_unit, currency) values
    (ws_personal, 'Grab shares', 'Stock', 'GRAB', 'yahoo', 4181, 3.9, 'USD');

  insert into public.assets (workspace_id, name, type, symbol, price_source, manual_value, currency, notes) values
    (ws_personal, 'PVD (self)',     'Fund', null,             'manual', 528097,  'THB', 'Provident Fund — self contribution'),
    (ws_personal, 'PVD (employer)', 'Fund', null,             'manual', 1056194, 'THB', 'Provident Fund — employer contribution'),
    (ws_personal, 'SSF',            'Fund', null,             'manual', 190220,  'THB', null),
    (ws_personal, 'Savings',        'Cash', null,             'manual', 120000,  'THB', null),
    (ws_personal, 'RMF Bond — K-FIRMF',         'Fund', 'K-FIRMF',         'finnomena', 160000, 'THB', '40% RMF'),
    (ws_personal, 'RMF AI Tech — TAIRMF-A',     'Fund', 'TAIRMF-A',        'finnomena', 120000, 'THB', '30% RMF'),
    (ws_personal, 'RMF India — K-INDIARMF',     'Fund', 'K-INDIARMF',      'finnomena',  60000, 'THB', '15% RMF'),
    (ws_personal, 'RMF Ark — ES-GINNORMF',      'Fund', 'ES-GINNORMF',     'finnomena',  60000, 'THB', '15% RMF'),
    (ws_personal, 'Thai ESG — KKP GB THAI ESG', 'Fund', 'KKP-GB-THAI-ESG', 'finnomena', 300000, 'THB', null);

  -- Marriage
  insert into public.assets (workspace_id, name, type, price_source, manual_value, currency) values
    (ws_marriage, 'Condo',   'House', 'manual', 2909000, 'THB'),
    (ws_marriage, 'Savings', 'Cash',  'manual',  862114, 'THB');
end $$;
