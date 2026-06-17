create table public.quote_flights (
  id        uuid primary key default gen_random_uuid(),
  quote_id  uuid not null references public.quotes(id) on delete cascade,
  legacy_flight_id text,
  note      text,
  sort_order int not null default 0
);

create table public.quote_flight_segments (
  id          uuid primary key default gen_random_uuid(),
  flight_id   uuid not null references public.quote_flights(id) on delete cascade,
  date text, flight_no text, airline_code text, airline_name text,
  dep_airport text, arr_airport text, dep_city text, arr_city text,
  dep_time text, arr_time text, dep_day_offset int, arr_day_offset int,
  sort_order int not null default 0
);

create table public.quote_flight_fares (
  id        uuid primary key default gen_random_uuid(),
  flight_id uuid not null references public.quote_flights(id) on delete cascade,
  legacy_fare_id text, label text not null default '',
  amount double precision not null default 0, cur text not null default 'VND',
  sort_order int not null default 0
);

create table public.quote_workflow_steps (
  id        uuid primary key default gen_random_uuid(),
  quote_id  uuid not null references public.quotes(id) on delete cascade,
  legacy_step_id text,
  label     text not null default '',
  status    text not null default 'todo' check (status in ('todo','doing','done','blocked')),
  step_key  text,
  due_offset int,
  start_date date, due_date date, done_date date,
  assignee_user_id uuid references public.profiles(id),
  assignee_username text,
  note      text,
  sort_order int not null default 0
);

create table public.quote_workflow_logs (
  id      uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.quote_workflow_steps(id) on delete cascade,
  at      timestamptz not null default now(),
  by_name text not null default '',
  action  text not null default '',
  sort_order int not null default 0
);

do $$
declare t text;
begin
  foreach t in array array['quote_flights','quote_flight_segments','quote_flight_fares','quote_workflow_steps','quote_workflow_logs'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
  end loop;
end $$;
