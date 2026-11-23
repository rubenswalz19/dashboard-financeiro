-- Execute este script no SQL Editor do projeto Supabase do FinPulse.
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  description text not null check (char_length(description) between 1 and 60),
  type text not null check (type in ('entrada', 'saida')),
  date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date desc, created_at desc);

alter table public.transactions enable row level security;

drop policy if exists "FinPulse users can view own transactions" on public.transactions;
create policy "FinPulse users can view own transactions"
  on public.transactions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "FinPulse users can add own transactions" on public.transactions;
create policy "FinPulse users can add own transactions"
  on public.transactions for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "FinPulse users can delete own transactions" on public.transactions;
create policy "FinPulse users can delete own transactions"
  on public.transactions for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.transactions to authenticated;
