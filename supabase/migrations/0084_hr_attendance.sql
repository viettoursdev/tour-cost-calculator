-- Module Nhân sự — Chấm công & Bảng công (timesheet theo NGÀY bằng mã).
--  • hr_attendance: 1 dòng = 1 nhân viên (employee_legacy_id) × 1 tháng (period "YYYY-MM").
--    `days` jsonb giữ bản đồ ngày→ô {code,note} (đúng cấu trúc file Excel HR);
--    `summary` jsonb là tổng công tính sẵn; `status` draft|published|locked;
--    `confirmation` + `feedback` phục vụ NV tự xác nhận / báo sai sót gửi nhân sự.
--  • App id ở legacy_id như các bảng hr_* khác; client đặt legacy_id tất định
--    `att-{employee_legacy_id}-{period}` để import lại tháng cũ KHÔNG sinh trùng dòng
--    (unique(employee_legacy_id, period) là lưới an toàn thứ hai).
--  • Phân quyền XEM theo phòng (Trưởng/Phó Phòng) và "chỉ thấy của mình" (NV thường)
--    được siết ở TẦNG ỨNG DỤNG (recordAccess + map currentUser↔hr_employees), nhất quán
--    với hr_employees/hr_leaves. RLS DB chỉ chặn ngoài miền @viettours.com.vn.

create table public.hr_attendance (
  id                  uuid primary key default gen_random_uuid(),
  legacy_id           text unique,
  employee_legacy_id  text not null default '',
  employee_code       text not null default '',
  full_name           text not null default '',
  department          text not null default '',
  period              text not null default '',                       -- "YYYY-MM"
  days                jsonb not null default '{}'::jsonb,             -- { "2026-06-03": {code,note} }
  summary             jsonb not null default '{}'::jsonb,             -- tổng công tính sẵn
  status              text not null default 'draft',                  -- draft|published|locked
  confirmation        jsonb not null default '{"status":"pending"}'::jsonb,
  feedback            jsonb not null default '[]'::jsonb,             -- AttendanceFeedback[]
  source              text not null default 'manual',                 -- excel|manual|self
  created_by_username text not null default '',
  created_by_name     text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  updated_by_name     text,
  unique (employee_legacy_id, period)
);

create index hr_attendance_period_idx on public.hr_attendance(period);
create index hr_attendance_emp_idx    on public.hr_attendance(employee_legacy_id);
create index hr_attendance_dept_idx   on public.hr_attendance(department);

do $$
declare t text;
begin
  foreach t in array array['hr_attendance'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
    execute format('alter publication supabase_realtime add table public.%I;', t);
  end loop;
end $$;
