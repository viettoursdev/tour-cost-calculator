-- Chấm công — CÀI ĐẶT GIỜ làm (tùy chọn chấm công theo giờ vào/ra cho phòng cần).
--  • Thêm cột settings jsonb vào attendance_config: {hourTracking, standardStart,
--    standardEnd, breakMins, graceMins}. Rỗng = dùng mặc định trong code, tắt theo-giờ.
--  • Giờ vào/ra lưu THẲNG trong hr_attendance.days[iso] = {code, note, in, out, hours}
--    (jsonb, không cần cột mới).
alter table public.attendance_config
  add column if not exists settings jsonb not null default '{}'::jsonb;
