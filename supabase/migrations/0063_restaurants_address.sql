-- Thêm cột địa chỉ cho nhà hàng. UI và type Restaurant đã có `address` từ lâu
-- nhưng bảng (migration 0012) thiếu cột → giá trị nhập vào không lưu được và bị
-- realtime echo xoá ngay. Additive, không đụng dữ liệu cũ.
alter table public.restaurants add column if not exists address text;
