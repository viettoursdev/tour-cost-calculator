-- Mật khẩu xuất danh sách khách xin visa (chứa PII: hộ chiếu, ngày sinh…).
-- Trưởng Phòng trở lên (CEO / Ban Giám Đốc / Trưởng Phòng) đặt 1 lần, áp dụng
-- cho MỌI người & MỌI máy. Lưu HASH bcrypt trong app_config; client chỉ gọi RPC
-- để đặt / kiểm tra, KHÔNG bao giờ đọc hash trực tiếp.
create extension if not exists pgcrypto;

-- Ẩn HASH mật khẩu khỏi client: thay policy đọc app_config để loại trừ khoá nhạy
-- cảm. Các RPC bên dưới là SECURITY DEFINER nên vẫn đọc được (bỏ qua RLS).
drop policy if exists app_config_company_read on public.app_config;
create policy app_config_company_read on public.app_config
  for select using (public.is_viettours_user() and key <> 'visa_export_password_hash');

-- Đặt / đổi mật khẩu xuất. Chỉ Trưởng Phòng+ mới được gọi.
create or replace function public.set_visa_export_password(new_pw text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  if not public.is_viettours_user() then
    raise exception 'Không có quyền.';
  end if;
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is null or caller_role not in ('CEO', 'Ban Giám Đốc', 'Trưởng Phòng') then
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

-- Kiểm tra mật khẩu khi xuất. Trả về true/false, KHÔNG lộ hash.
create or replace function public.verify_visa_export_password(pw text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when not public.is_viettours_user() then false
    else coalesce(
      (select value = crypt(pw, value)
         from public.app_config where key = 'visa_export_password_hash'),
      false)
  end;
$$;

-- Đã đặt mật khẩu chưa? (để client hiển thị đúng trạng thái).
create or replace function public.visa_export_password_is_set()
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when not public.is_viettours_user() then false
    else exists(select 1 from public.app_config where key = 'visa_export_password_hash')
  end;
$$;

grant execute on function public.set_visa_export_password(text) to authenticated;
grant execute on function public.verify_visa_export_password(text) to authenticated;
grant execute on function public.visa_export_password_is_set() to authenticated;
