-- Phase 4b: store user PDF passwords for auto-decrypt of statement uploads.
-- Run this once in Supabase SQL Editor.

create table if not exists public.pdf_passwords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  password text not null,
  created_at timestamptz not null default now()
);

create index if not exists pdf_passwords_user_idx on public.pdf_passwords(user_id);

alter table public.pdf_passwords enable row level security;

drop policy if exists "pdf own select" on public.pdf_passwords;
drop policy if exists "pdf own insert" on public.pdf_passwords;
drop policy if exists "pdf own delete" on public.pdf_passwords;

create policy "pdf own select" on public.pdf_passwords
  for select using (auth.uid() = user_id);
create policy "pdf own insert" on public.pdf_passwords
  for insert with check (auth.uid() = user_id);
create policy "pdf own delete" on public.pdf_passwords
  for delete using (auth.uid() = user_id);
