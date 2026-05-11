-- Phase 10: debt balance on assets + loan_repayment transaction type

-- 1. Outstanding loan/mortgage balance on assets (House, etc.)
alter table public.assets
  add column if not exists debt_balance numeric;

-- 2. Allow loan_repayment as a tx_type
--    units_delta column (already exists from migration 010) stores the principal portion.
alter table public.transactions drop constraint if exists transactions_tx_type_check;
alter table public.transactions add constraint transactions_tx_type_check
  check (tx_type in (
    'auto','income','expense','transfer','transfer_in',
    'cc_payment','cc_payment_received','reimbursement','asset_buy','loan_repayment'
  ));
