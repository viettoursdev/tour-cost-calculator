-- Siết quyền XEM hồ sơ tour xuống tầng DB (RLS), khớp recordAccess ở client.
--  TIỀN ĐỀ: cột profiles.department CHƯA tồn tại (department vốn không được đồng bộ
--  xuống DB → quy tắc "thấy theo phòng ban" trước nay không chạy thật). Bản vá này
--  (a) thêm cột department + cho phép role 'Phó Phòng', (b) RLS lọc SELECT tour_profiles.
--
--  CHÍNH SÁCH KHÔNG-KHOÁ-CỨNG: user LUÔN thấy hồ sơ MÌNH TẠO (kể cả khi role/
--  department trong profiles chưa được đồng bộ) → không ai bị khoá khỏi dữ liệu của
--  chính mình. Quy tắc phòng ban/role chỉ MỞ RỘNG thêm phạm vi.
--
--  SAU KHI ÁP: admin cần vào "Quản lý người dùng" và Lưu (đẩy department/role xuống
--  profiles qua sbPushUsers) để quy tắc Trưởng/Phó Phòng + BGĐ/CEO hoạt động đầy đủ.
--  GHI: chỉ siết SELECT; quyền GHI giữ nguyên (is_viettours_user) — app tự enforce sửa.

-- 1) Cột phòng ban (đồng bộ từ app qua sbPushUsers sau khi deploy).
alter table public.profiles add column if not exists department text;

-- 2) Cho phép role 'Phó Phòng' (app đã có cấp này; enum DB còn thiếu → upsert role này
--    trước đây sẽ bị check chặn).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('CEO','Ban Giám Đốc','Trưởng Phòng','Phó Phòng',
                  'Sales','Operations','Marketing','Admin','Accountant','Standard'));

-- 3) RLS đọc tour_profiles theo quyền (thay policy permissive cũ).
drop policy if exists tour_profiles_read on public.tour_profiles;
create policy tour_profiles_read on public.tour_profiles for select using (
  public.is_viettours_user() and (
    -- (1) người tạo — LUÔN thấy (chống khoá cứng)
    created_by_username = (select p.username from public.profiles p where p.id = auth.uid())
    -- (2) cộng tác / (3) theo dõi (jsonb chứa username của mình)
    or collaborators @> jsonb_build_array(jsonb_build_object('u', (select p.username from public.profiles p where p.id = auth.uid())))
    or followers     @> jsonb_build_array(jsonb_build_object('u', (select p.username from public.profiles p where p.id = auth.uid())))
    -- (4) CEO & Ban Giám Đốc thấy tất cả
    or (select p.role from public.profiles p where p.id = auth.uid()) in ('CEO','Ban Giám Đốc')
    -- (5) Trưởng Phòng / Phó Phòng thấy hồ sơ do người CÙNG PHÒNG tạo
    or (
      (select p.role from public.profiles p where p.id = auth.uid()) in ('Trưởng Phòng','Phó Phòng')
      and (select p.department from public.profiles p where p.id = auth.uid()) is not null
      and (select p.department from public.profiles p where p.id = auth.uid())
          = (select c.department from public.profiles c where c.username = tour_profiles.created_by_username)
    )
  )
);
