alter table public.notifications add column if not exists priority text;
alter table public.notifications add column if not exists reminder jsonb;
