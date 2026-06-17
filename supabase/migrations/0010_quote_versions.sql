create table public.quote_versions (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes(id) on delete cascade,
  version_no  int not null,
  saved_at    timestamptz not null default now(),
  saved_by    text not null default '',
  note        text not null default '',
  state       jsonb not null,             -- full QuoteDraft snapshot
  unique (quote_id, version_no)
);
create index quote_versions_quote_idx on public.quote_versions(quote_id);

alter table public.quote_versions enable row level security;
create policy qv_read  on public.quote_versions for select using (public.is_viettours_user());
create policy qv_write on public.quote_versions for all using (public.is_viettours_user()) with check (public.is_viettours_user());
