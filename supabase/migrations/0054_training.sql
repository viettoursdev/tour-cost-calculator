-- Đào tạo nhân viên mới (Training / Onboarding) — Đợt 1.
--  • training_programs: curriculum chuẩn theo phòng ban/cấp (clone từ seed hoặc
--    tự tạo). Bản dựng sẵn trong code KHÔNG nằm ở đây (trainingSeed.ts).
--  • training_enrollments: 1 học viên ghi danh 1 program; tiến độ từng module +
--    gate + chứng nhận lưu JSONB (giống todos: row-per-record, nested JSONB).
-- App id giữ ở `legacy_id` (text, ổn định cho client) như process_templates.

create table public.training_programs (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  department    text not null default '',
  role_target   text not null default 'L2',
  name          text not null default '',
  description   text not null default '',
  cert_title    text not null default '',
  icon          text not null default '',
  color         text not null default '',
  modules       jsonb not null default '[]'::jsonb,    -- TrainingModule[]
  version       int  not null default 1,
  is_published  boolean not null default false,
  created_by_username text not null default '',
  created_by_name     text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  updated_by_name text
);

create table public.training_enrollments (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  program_id    text,                                  -- legacy_id của program
  employee_id   uuid references public.hr_employees(id) on delete set null,
  learner_username text not null default '',
  learner_name     text not null default '',
  mentor_username  text not null default '',
  department    text not null default '',
  status        text not null default 'active',         -- active|certified|paused|dropped
  start_date    date,
  progress      jsonb not null default '{}'::jsonb,      -- { [moduleId]: ModuleProgress }
  gates         jsonb not null default '{}'::jsonb,      -- { [phase]: 'open'|'pass' }
  certified_at  timestamptz,
  cert_code     text,
  created_by_username text not null default '',
  created_by_name     text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  updated_by_name text
);

create index training_enroll_emp_idx     on public.training_enrollments(employee_id);
create index training_enroll_learner_idx on public.training_enrollments(learner_username);
create index training_enroll_program_idx on public.training_enrollments(program_id);

-- RLS: nội bộ Viettours đọc/ghi (giống process). Siết theo learner/mentor/HR ở
-- đợt sau nếu cần — Đợt 1 giữ mở trong phạm vi công ty.
do $$
declare t text;
begin
  foreach t in array array['training_programs','training_enrollments'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
    execute format('alter publication supabase_realtime add table public.%I;', t);
  end loop;
end $$;
