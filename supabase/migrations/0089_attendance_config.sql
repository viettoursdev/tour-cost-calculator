-- Chấm công — từ điển MÃ CÔNG tự quản (HR sửa nhãn/số công/màu/thêm mã trên UI).
--  • attendance_config: 1 dòng dùng chung (one_row) chứa mảng mã `codes` jsonb.
--    Rỗng = dùng bộ mã mặc định trong code (src/lib/attendance/attendanceCodes.ts).
--  • Sửa bởi HR (manageHR) — siết ở tầng app như các bảng hr_*; RLS DB chỉ chặn
--    ngoài miền @viettours.com.vn.
create table public.attendance_config (
  one_row      boolean primary key default true check (one_row),
  codes        jsonb not null default '[]'::jsonb,   -- AttendanceCodeDef[]
  updated_at   timestamptz,
  updated_by   text
);

do $$
declare t text;
begin
  foreach t in array array['attendance_config'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
    execute format('alter publication supabase_realtime add table public.%I;', t);
  end loop;
end $$;
