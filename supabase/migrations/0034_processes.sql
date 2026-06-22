-- Quy trình phòng ban (SOP) — Đợt 1.
--  • process_templates: thư viện quy trình chuẩn theo phòng ban (clone từ seed
--    hoặc tự tạo). Bản dựng sẵn trong code KHÔNG nằm ở đây.
--  • process_runs: phiên chạy 1 quy trình cho 1 việc thật (snapshot các bước).
-- App id giữ ở `legacy_id` (text, ổn định cho client) như visa_procedures.

create table public.process_templates (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  department  text not null default '',
  name        text not null default '',
  description text not null default '',
  icon        text not null default '',
  color       text not null default '',
  steps       jsonb not null default '[]'::jsonb,    -- WorkflowStep[]
  version     int  not null default 1,
  is_published boolean not null default true,
  created_by_username text not null default '',
  created_by_name     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  updated_by_name text
);

create table public.process_runs (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  template_id text,
  department  text not null default '',
  title       text not null default '',
  ref_kind    text,           -- 'quote' | 'customer' | 'visa'
  ref_id      text,
  ref_label   text,
  steps       jsonb not null default '[]'::jsonb,    -- WorkflowStep[] (snapshot)
  status      text not null default 'active',         -- active | done | archived
  assignee    text,
  start_date  date,
  due_date    date,
  created_by_username text not null default '',
  created_by_name     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  updated_by_name text
);

do $$
declare t text;
begin
  foreach t in array array['process_templates','process_runs'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
    execute format('alter publication supabase_realtime add table public.%I;', t);
  end loop;
end $$;
