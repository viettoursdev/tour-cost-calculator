-- Chi phí visa: lưu dự toán + thực chi của từng dự án visa lên cloud (chia sẻ đa máy).
-- Thuần THÊM cột jsonb; không đụng dữ liệu cũ.
alter table public.visa_projects
  add column if not exists costing jsonb;
