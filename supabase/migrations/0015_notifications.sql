create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  legacy_id  text,
  user_id    uuid not null references public.profiles(id) on delete cascade,   -- owner (was user_notifications/{username})
  type       text not null,
  title      text not null default '',
  message    text not null default '',
  created_by uuid references public.profiles(id),
  created_by_name text,
  created_at timestamptz not null default now(),
  read       boolean not null default false,
  link       jsonb,
  thread_id  text,
  data       jsonb
);
create index notifications_user_idx on public.notifications(user_id);

create table public.notification_threads (
  id          text primary key,            -- threadId (string, app-generated)
  title       text not null default '',
  link        jsonb,
  act_type    text,
  status      text,
  created_by  uuid references public.profiles(id),
  created_by_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  updated_by_name text,
  data        jsonb
);

create table public.notification_thread_members (
  thread_id text not null references public.notification_threads(id) on delete cascade,
  user_id   uuid references public.profiles(id),
  username  text,
  primary key (thread_id, username)
);

create table public.notification_comments (
  id        uuid primary key default gen_random_uuid(),
  thread_id text not null references public.notification_threads(id) on delete cascade,
  legacy_id text,
  by_user_id uuid references public.profiles(id),
  by_username text,
  by_name   text not null default '',
  text      text not null default '',
  at        timestamptz not null default now(),
  sort_order int not null default 0
);

do $$
declare t text;
begin
  foreach t in array array['notifications','notification_threads','notification_thread_members','notification_comments'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
  end loop;
end $$;
