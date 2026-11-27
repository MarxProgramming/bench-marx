-- Public, editable training journals. Earlier account tables stay private.
begin;

create table if not exists public.bench_shared_entries (
  journal text not null check (journal in ('marx', 'dan')),
  entry_key text not null check (entry_key ~ '^(catalogue|[0-9]{4}-[0-9]{2}-[0-9]{2})[.][a-zA-Z0-9_-]{1,80}$'),
  payload jsonb check (payload is null or (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 8192)),
  primary key (journal, entry_key)
);

alter table public.bench_shared_entries enable row level security;
revoke all on public.bench_shared_entries from public, anon, authenticated;

create or replace function public.bench_shared_pull(p_journal text, p_after text default '')
returns table(entry_key text, payload jsonb)
language sql stable security definer set search_path = '' as $$
  select e.entry_key, e.payload from public.bench_shared_entries e
  where e.journal = p_journal and e.entry_key > p_after
  order by e.entry_key limit 200
$$;

create or replace function public.bench_shared_push(p_journal text, p_entries jsonb, p_only_missing boolean default false)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  written integer;
begin
  if p_journal is null or p_journal not in ('marx', 'dan') then
    raise exception 'Invalid journal' using errcode = '22023';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or pg_column_size(p_entries) > 262144 then
    raise exception 'Invalid journal entries' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 100 then
    raise exception 'Invalid journal batch size' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_entries) as r(entry_key text, payload jsonb)
    where r.payload is not null and (
      r.payload->>'id' is distinct from split_part(r.entry_key,'.',2)
      or (case when r.payload->>'type' in ('exercise','category') then 'catalogue' else r.payload->>'day' end)
         is distinct from split_part(r.entry_key,'.',1)
    )
  ) then
    raise exception 'Journal entry does not match its key' using errcode = '22023';
  end if;

  if p_only_missing then
    insert into public.bench_shared_entries(journal,entry_key,payload)
    select p_journal,r.entry_key,r.payload from jsonb_to_recordset(p_entries) as r(entry_key text,payload jsonb)
    on conflict (journal,entry_key) do nothing;
  else
    insert into public.bench_shared_entries(journal,entry_key,payload)
    select p_journal,r.entry_key,r.payload from jsonb_to_recordset(p_entries) as r(entry_key text,payload jsonb)
    on conflict (journal,entry_key) do update set payload=excluded.payload;
  end if;
  get diagnostics written = row_count;
  return written;
end;
$$;

revoke execute on function public.bench_shared_pull(text,text) from public, anon, authenticated;
revoke execute on function public.bench_shared_push(text,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.bench_shared_pull(text,text) to anon;
grant execute on function public.bench_shared_push(text,jsonb,boolean) to anon;

commit;
