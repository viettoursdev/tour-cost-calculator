-- Module Nhân sự — Đợt 7: nghỉ phép (đăng ký + duyệt) + lịch khả dụng.
--  • hr_leaves: 1 đơn nghỉ phép của 1 nhân viên (employee_legacy_id), khoảng ngày
--    + số ngày (hỗ trợ nửa ngày), loại nghỉ, trạng thái duyệt + người duyệt.
-- BẢN NHẸ hợp công ty tour: KHÔNG chấm công giờ/ca — chỉ phục vụ biết ai rảnh để
-- phân tour (gộp với tour-đang-đi ở client). App id ở legacy_id như các bảng hr_*.

create table public.hr_leaves (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  employee_legacy_id text not null default '',
  type          text not null default 'annual',      -- annual|unpaid|sick|other
  start_date    date,
  end_date      date,
  days          numeric not null default 1,           -- số ngày (0.5 = nửa ngày)
  reason        text not null default '',
  status        text not null default 'pending',      -- pending|approved|rejected|cancelled
  approver_name text not null default '',
  decided_at    timestamptz,
  decision_note text not null default '',
  created_by_username text not null default '',
  created_by_name     text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  updated_by_name text
);

create index hr_leaves_emp_idx    on public.hr_leaves(employee_legacy_id);
create index hr_leaves_status_idx on public.hr_leaves(status);
create index hr_leaves_range_idx  on public.hr_leaves(start_date, end_date);

do $$
declare t text;
begin
  foreach t in array array['hr_leaves'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
    execute format('alter publication supabase_realtime add table public.%I;', t);
  end loop;
end $$;
