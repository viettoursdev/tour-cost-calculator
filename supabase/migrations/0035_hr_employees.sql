-- Module Nhân sự — Đợt 1: hồ sơ nhân viên in-house + giấy tờ + org chart.
--  • hr_employees: master nhân sự (KHÔNG đồng nhất với profiles; đa số không đăng nhập).
--    `manager_legacy_id` tự tham chiếu legacy_id → dựng sơ đồ tổ chức ở client.
--  • hr_documents: giấy tờ pháp lý của 1 nhân viên (queryable cho nhắc hết hạn 90/30 ngày).
-- App id giữ ở legacy_id (text, ổn định cho client) như process_* / visa_procedures.

create table public.hr_employees (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  employee_code text not null default '',          -- mã NV nội bộ
  full_name     text not null default '',
  email         text not null default '',
  phone         text not null default '',
  dob           date,
  gender        text,                                -- 'male'|'female'|'other'
  avatar_url    text,                                -- R2
  department    text not null default '',            -- id phòng ban (DEPARTMENTS) hoặc free text
  title         text not null default '',            -- chức danh
  level         text not null default '',            -- cấp bậc (junior/senior/lead...)
  manager_legacy_id text,                            -- self-ref (legacy_id) → org chart
  status        text not null default 'probation',   -- probation|official|resigned
  join_date     date,
  resign_date   date,
  emergency_contact jsonb not null default '{}'::jsonb,
  career_path_id text,                               -- móc sẵn cho Đợt 3 (khung năng lực)
  profile_email text,                                -- link tùy chọn tới profiles.email
  notes         text not null default '',
  created_by_username text not null default '',
  created_by_name     text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  updated_by_name text
);

create table public.hr_documents (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.hr_employees(id) on delete cascade,
  legacy_id     text,
  kind          text not null default '',            -- HĐLĐ|Bằng cấp|Chứng chỉ|BHXH|CCCD...
  name          text not null default '',
  file_url      text,                                -- R2
  issued_at     date,
  expires_at    date,                                -- NULL = không hết hạn
  notes         text not null default '',
  sort_order    int not null default 0
);

create index hr_documents_emp_idx     on public.hr_documents(employee_id);
create index hr_documents_expires_idx on public.hr_documents(expires_at);
create index hr_employees_mgr_idx     on public.hr_employees(manager_legacy_id);

-- RLS + realtime (đúng khối do-$$ của 0034_processes). Cổng thô: chỉ user @viettours.
-- Siết quyền xem theo phòng ban ở LỚP GIAO DIỆN (viewHR/manageHR), như hồ sơ khách.
do $$
declare t text;
begin
  foreach t in array array['hr_employees','hr_documents'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
    execute format('alter publication supabase_realtime add table public.%I;', t);
  end loop;
end $$;
