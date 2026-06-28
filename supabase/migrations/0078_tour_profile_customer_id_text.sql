-- ════════════════════════════════════════════════════════════════════════
--  0078 — Sửa kiểu tour_profiles.customer_id: uuid → text.
--
--  BUG: app định danh khách bằng Customer.id = customers.legacy_id (TEXT, vd
--  "mqy4p6ia6nn3"); uuid thật ở customers.id do DB tự sinh và app KHÔNG cầm lúc
--  tạo (khách mới chỉ có uuid sau khi subscribe nạp lại). Nhưng tour_profiles.customer_id
--  lại là `uuid references customers(id)` → khi gắn khách vào hồ sơ, app ghi legacy_id
--  text vào cột uuid → lỗi "invalid input syntax for type uuid" → tạo hồ sơ thất bại.
--
--  FIX: đổi customer_id sang text (lưu legacy_id), bỏ FK uuid. Đồng nhất với
--  mapping rowToTourProfile/tourProfileToRow (vốn đã coi customerId là string) và
--  với thiết kế "hồ sơ tour MỎNG" liên kết lỏng (customer_name vẫn lưu kèm để hiển thị).
--
--  CỘNG THÊM / đổi kiểu — KHÔNG destructive (using ::text giữ mọi giá trị cũ).
-- ════════════════════════════════════════════════════════════════════════

alter table public.tour_profiles
  drop constraint if exists tour_profiles_customer_id_fkey;

alter table public.tour_profiles
  alter column customer_id type text using customer_id::text;
