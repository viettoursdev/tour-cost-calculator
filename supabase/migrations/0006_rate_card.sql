-- Hotels keyed by city; entries is the opaque HotelEntry[] for that city.
create table public.rate_card_hotels (
  city    text primary key,
  entries jsonb not null default '[]'::jsonb
);

-- Other rates keyed by the legacy vte_rate_* key; entry is opaque.
create table public.rate_card_other (
  rkey  text primary key,
  entry jsonb not null default '{}'::jsonb
);

-- Visa rates: a single opaque object. one_row enforces the singleton.
create table public.rate_card_visa (
  one_row boolean primary key default true check (one_row),
  data    jsonb not null default '{}'::jsonb
);

create table public.rate_card_meta (
  one_row   boolean primary key default true check (one_row),
  version   text, type text, pushed_at timestamptz, pushed_by text,
  app       text, auto_sync boolean
);

do $$
declare t text;
begin
  foreach t in array array['rate_card_hotels','rate_card_other','rate_card_visa','rate_card_meta'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
  end loop;
end $$;
