-- 0093_customer_crm_fields.sql
-- Fix mất dữ liệu: modal khách hàng cho nhập nhiều trường B2B/CRM nhưng bảng
-- `customers` không có cột tương ứng → các trường này chỉ nằm trong Zustand và bị
-- xoá trắng ở lần realtime refresh kế tiếp. Thêm cột để `sbPushCustomers` /
-- `rowToCustomer` round-trip đầy đủ. KHÔNG đụng dữ liệu cũ (chỉ ADD COLUMN nullable).

alter table public.customers add column if not exists owner_username    text;
alter table public.customers add column if not exists owner_name        text;
alter table public.customers add column if not exists preferred_channel text;
alter table public.customers add column if not exists birthday          text;   -- ISO yyyy-mm-dd (giữ text: khách để trống → tránh lỗi ép date)
alter table public.customers add column if not exists payment_terms     text;
alter table public.customers add column if not exists credit_limit      numeric;
alter table public.customers add column if not exists refund_bank       jsonb;  -- BankInfo
alter table public.customers add column if not exists travelers         jsonb;  -- TravelerDoc[] (PII hộ chiếu/visa)
alter table public.customers add column if not exists files             jsonb;  -- FileAttachment[]
alter table public.customers add column if not exists collaborators     jsonb;  -- Collaborator[] (chia sẻ xem)
-- Username người tạo — cần cho phân quyền theo phòng (recordAccess) & gate PII.
-- Trước đây chỉ lưu created_by_name (tên hiển thị) → quy tắc "xem theo phòng" và
-- chia sẻ collab thất bại âm thầm sau mỗi refresh.
alter table public.customers add column if not exists created_by_username text;

-- Sinh nhật người liên hệ (để chăm sóc) — cũng bị rớt khi round-trip.
alter table public.customer_contacts add column if not exists birthday text;
