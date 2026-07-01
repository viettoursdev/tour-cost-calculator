-- Chấm công — nhật ký thay đổi từng ô (audit log) trên mỗi bảng công.
--  • Thêm cột history jsonb: mảng {at, by, date, from, to} ghi mỗi lần đổi mã 1 ngày.
--  • Additive, không đụng dữ liệu cũ.
alter table public.hr_attendance
  add column if not exists history jsonb not null default '[]'::jsonb;
