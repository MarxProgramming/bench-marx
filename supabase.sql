-- Run in a dedicated training project. No public access to journal rows.
create table if not exists public.bench_journals (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  journal text not null check (journal in ('marx', 'dan')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  primary key (owner, journal)
);

alter table public.bench_journals enable row level security;
revoke all on public.bench_journals from anon, authenticated;
grant select, insert, update on public.bench_journals to authenticated;

drop policy if exists "Read own journal" on public.bench_journals;
drop policy if exists "Insert own journal" on public.bench_journals;
drop policy if exists "Update own journal" on public.bench_journals;
create policy "Read own journal" on public.bench_journals
  for select to authenticated using ((select auth.uid()) = owner);
create policy "Insert own journal" on public.bench_journals
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy "Update own journal" on public.bench_journals
  for update to authenticated using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

-- One row per entry so simultaneous changes to different entries can both sync.
-- A null payload propagates a deletion to other devices.
create table if not exists public.bench_sync_entries (
  owner uuid not null references auth.users(id) on delete cascade,
  journal text not null check (journal in ('marx', 'dan')),
  entry_key text not null check (char_length(entry_key) between 1 and 200),
  payload jsonb check (payload is null or jsonb_typeof(payload) = 'object'),
  primary key (owner, journal, entry_key)
);

alter table public.bench_sync_entries enable row level security;
revoke all on public.bench_sync_entries from public, anon, authenticated;
grant select, insert, update on public.bench_sync_entries to authenticated;

drop policy if exists "Read own entries" on public.bench_sync_entries;
drop policy if exists "Insert own entries" on public.bench_sync_entries;
drop policy if exists "Update own entries" on public.bench_sync_entries;
create policy "Read own entries" on public.bench_sync_entries
  for select to authenticated using ((select auth.uid()) = owner);
create policy "Insert own entries" on public.bench_sync_entries
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy "Update own entries" on public.bench_sync_entries
  for update to authenticated using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);
