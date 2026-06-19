-- quote_passengers: stores the passenger manifest / rooming list for a quote.
-- Each row is one passenger in QuoteDraft.passengers[]. Columns map 1-1 to
-- the Passenger type in src/types/quote.ts (camelCase → snake_case).

create table if not exists public.quote_passengers (
  id                  uuid primary key default gen_random_uuid(),
  quote_id            uuid not null references public.quotes(id) on delete cascade,
  legacy_passenger_id text,
  sort_order          int  not null default 0,
  -- Passenger fields (all optional except name)
  name        text not null default '',
  gender      text,
  dob         text,
  id_type     text,
  id_no       text,
  nationality text,
  room_type   text,
  room_no     text,
  dietary     text,
  phone       text,
  emergency   text,
  note        text
);

create index if not exists quote_passengers_quote_idx on public.quote_passengers(quote_id);

alter table public.quote_passengers enable row level security;

create policy quote_passengers_read  on public.quote_passengers
  for select using (public.is_viettours_user());

create policy quote_passengers_write on public.quote_passengers
  for all using (public.is_viettours_user()) with check (public.is_viettours_user());
