-- Lịch đi tour HDV: a single shared row (mirrors the Firestore viettours/guide_schedule doc).
create table public.guide_schedule (
  one_row     boolean primary key default true check (one_row),
  freelancers jsonb not null default '[]'::jsonb,
  assignments jsonb not null default '{}'::jsonb,
  updated_at  timestamptz,
  updated_by  text
);

alter table public.guide_schedule enable row level security;
create policy guide_schedule_read  on public.guide_schedule for select
  using (public.is_viettours_user());
create policy guide_schedule_write on public.guide_schedule for all
  using (public.is_viettours_user()) with check (public.is_viettours_user());

-- The store subscribes; emit live changes.
alter publication supabase_realtime add table public.guide_schedule;
