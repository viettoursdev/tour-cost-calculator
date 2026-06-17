create table public.itineraries (
  id           uuid primary key default gen_random_uuid(),
  legacy_id    text unique,
  code         text,
  type         text not null default 'ND' check (type in ('NN','ND')),
  continent    text, country text, seq int not null default 0,
  title        text not null default '', destination text,
  days int not null default 0, nights int not null default 0,
  intro        text not null default '',
  includes     text[] not null default '{}',
  excludes     text[] not null default '{}',
  exec         jsonb,                       -- ExecData (optional ops blob)
  linked_quote_id text, linked_quote_name text,
  created_by uuid references public.profiles(id), created_by_name text,
  created_at timestamptz not null default now(), updated_at timestamptz, updated_by_name text
);

create table public.itinerary_days (
  id           uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  day_num int not null default 0, date text, title text not null default '',
  meals    jsonb not null default '{"B":false,"L":false,"D":false}'::jsonb,
  meal_note text not null default '',
  segments jsonb not null default '[]'::jsonb,   -- Segment[] (groupLabel, transport, activities[])
  sort_order int not null default 0
);

create table public.itinerary_flights (
  id           uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  legacy_flight_id text,
  group_text text, leg text, flight_no text,
  dep text, arr text, dep_airport text, dep_time text,
  arr_airport text, arr_time text, dep_day_offset int, arr_day_offset int,
  sort_order int not null default 0
);

do $$
declare t text;
begin
  foreach t in array array['itineraries','itinerary_days','itinerary_flights'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
  end loop;
end $$;
