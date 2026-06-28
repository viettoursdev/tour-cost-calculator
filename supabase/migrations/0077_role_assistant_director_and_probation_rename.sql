-- Điều chỉnh vai trò & phân quyền:
--   1) Thêm role 'Trợ lý Giám Đốc' (dưới Ban Giám Đốc, trên Trưởng Phòng) — quyền
--      tương tự Ban Giám Đốc, phụ trách TOÀN BỘ phòng ban.
--   2) Đổi tên role 'Standard' → 'NV Thử việc' (giữ nguyên dữ liệu — chỉ UPDATE, không xoá).
--   3) Đưa 'Trợ lý Giám Đốc' vào các cổng "thấy tất cả" / "được duyệt" ở tầng DB cho
--      khớp app (BOARD_ROLES + APPROVER_ROLES).
-- Quản lý tài khoản (manageUsers) chỉ enforced ở app (CHỈ CEO) — DB không có cổng riêng.

-- 1) Đổi tên role cũ TRƯỚC khi siết constraint mới (constraint cũ chưa biết 'NV Thử việc').
alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles set role = 'NV Thử việc' where role = 'Standard';

alter table public.profiles add constraint profiles_role_check
  check (role in ('CEO','Ban Giám Đốc','Trợ lý Giám Đốc','Trưởng Phòng','Phó Phòng',
                  'Sales','Operations','Marketing','Admin','Accountant','NV Thử việc'));

-- Default cột + trigger provisioning: NV mới mặc định 'NV Thử việc' (Standard cũ).
alter table public.profiles alter column role set default 'NV Thử việc';

-- GIỮ NGUYÊN cách đọc CEO email từ app_config (0028) — chỉ đổi default role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ceo_email text := (select value from public.app_config where key = 'bootstrap_ceo_email');
begin
  insert into public.profiles (id, email, username, name, role)
  values (
    new.id,
    new.email,
    split_part(new.email, '@', 1),
    split_part(new.email, '@', 1),
    case when new.email = ceo_email then 'CEO' else 'NV Thử việc' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2) tour_profile_can_view — thêm 'Trợ lý Giám Đốc' vào nhóm "thấy tất cả" (mirror 0047).
create or replace function public.tour_profile_can_view(
  p_created_by text, p_collaborators jsonb, p_followers jsonb
) returns boolean
language sql stable security invoker
set search_path = public
as $$
  select
    -- (1) người tạo — LUÔN thấy (chống khoá cứng)
    p_created_by = (select username from public.profiles where id = auth.uid())
    -- (2) cộng tác / (3) theo dõi
    or p_collaborators @> jsonb_build_array(jsonb_build_object('u', (select username from public.profiles where id = auth.uid())))
    or p_followers     @> jsonb_build_array(jsonb_build_object('u', (select username from public.profiles where id = auth.uid())))
    -- (4) cấp Ban Giám Đốc (CEO / Ban Giám Đốc / Trợ lý Giám Đốc) thấy tất cả
    or (select role from public.profiles where id = auth.uid()) in ('CEO','Ban Giám Đốc','Trợ lý Giám Đốc')
    -- (5) Trưởng Phòng / Phó Phòng thấy hồ sơ do người CÙNG PHÒNG tạo
    or (
      (select role from public.profiles where id = auth.uid()) in ('Trưởng Phòng','Phó Phòng')
      and (select department from public.profiles where id = auth.uid()) is not null
      and (select department from public.profiles where id = auth.uid())
          = (select department from public.profiles where username = p_created_by)
    );
$$;

-- 3) kb_can_view — thêm 'Trợ lý Giám Đốc' vào nhóm "thấy tất cả" (mirror 0070).
create or replace function public.kb_can_view(p_department text, p_created_by text)
returns boolean
language sql stable security invoker
set search_path = public
as $$
  select
    p_department is null
    or p_created_by = (select username from public.profiles where id = auth.uid())
    or (select role from public.profiles where id = auth.uid()) in ('CEO','Ban Giám Đốc','Trợ lý Giám Đốc')
    or (
      (select department from public.profiles where id = auth.uid()) is not null
      and (select department from public.profiles where id = auth.uid()) = p_department
    );
$$;

-- 4) can_approve_visa_share — thêm 'Trợ lý Giám Đốc' (cấp trên, mirror 0059).
create or replace function public.can_approve_visa_share()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and (role in ('CEO','Ban Giám Đốc','Trợ lý Giám Đốc')
            or (role = 'Trưởng Phòng' and department = 'visa'))
  );
$$;

-- 5) is_export_approver — thêm 'Trợ lý Giám Đốc' (mirror 0065 + APPROVER_ROLES).
create or replace function public.is_export_approver()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role in ('CEO','Ban Giám Đốc','Trợ lý Giám Đốc','Trưởng Phòng')
  );
$$;

-- 6) set_visa_export_password — Trưởng Phòng trở lên (nay gồm 'Trợ lý Giám Đốc'), mirror 0053.
create or replace function public.set_visa_export_password(new_pw text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_role text;
begin
  if not public.is_viettours_user() then
    raise exception 'Không có quyền.';
  end if;
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is null or caller_role not in ('CEO','Ban Giám Đốc','Trợ lý Giám Đốc','Trưởng Phòng') then
    raise exception 'Chỉ Trưởng Phòng trở lên mới được đặt mật khẩu xuất.';
  end if;
  if new_pw is null or length(new_pw) < 4 then
    raise exception 'Mật khẩu tối thiểu 4 ký tự.';
  end if;
  insert into public.app_config (key, value)
    values ('visa_export_password_hash', crypt(new_pw, gen_salt('bf')))
    on conflict (key) do update set value = excluded.value;
end;
$$;
