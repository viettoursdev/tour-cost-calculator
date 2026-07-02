-- Tùy chọn CẤP TỔ CHỨC lưu trong app_config (key-value, 0028):
--   nav_preset_{department} : bố cục thanh điều hướng MẶC ĐỊNH của phòng (JSON NavLayout)
--                             — điểm xuất phát cho nhân viên chưa tự tùy chỉnh.
--   module_flags            : bật/tắt module theo phòng (JSON, xem src/lib/featureFlags.ts).
--
-- app_config KHÔNG có policy ghi cho client (0028) — ghi qua RPC SECURITY DEFINER
-- gate theo vai trò trong profiles, đúng pattern set_visa_export_password (0053).
-- Đọc dùng policy select sẵn có (các khoá này không nhạy cảm).

create or replace function public.set_org_pref(pref_key text, pref_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_dept text;
  target_dept text;
begin
  if not public.is_viettours_user() then
    raise exception 'Không có quyền.';
  end if;
  select role, department into caller_role, caller_dept
    from public.profiles where id = auth.uid();

  if pref_key = 'module_flags' then
    if caller_role is null or caller_role not in ('CEO', 'Ban Giám Đốc', 'Trợ lý Giám Đốc') then
      raise exception 'Chỉ Ban Giám Đốc trở lên mới được cấu hình module.';
    end if;
  elsif pref_key like 'nav\_preset\_%' escape '\' then
    target_dept := substring(pref_key from 12);
    if target_dept not in ('dh_noidia', 'dh_nuocngoai', 'ketoan', 'visa', 'hdv', 'muahang', 'sukien') then
      raise exception 'Phòng ban không hợp lệ.';
    end if;
    if caller_role in ('CEO', 'Ban Giám Đốc', 'Trợ lý Giám Đốc') then
      null; -- BGĐ+ đặt được cho phòng bất kỳ
    elsif caller_role in ('Trưởng Phòng', 'Phó Phòng') and caller_dept = target_dept then
      null; -- Trưởng/Phó Phòng chỉ đặt cho phòng MÌNH
    else
      raise exception 'Chỉ Trưởng/Phó Phòng của phòng hoặc Ban Giám Đốc mới được đặt bố cục phòng.';
    end if;
  else
    raise exception 'Khoá cấu hình không hợp lệ.';
  end if;

  -- value rỗng/null = xoá tùy chọn (về mặc định hệ thống).
  if pref_value is null or pref_value = '' then
    delete from public.app_config where key = pref_key;
    return;
  end if;
  if length(pref_value) > 20000 then
    raise exception 'Giá trị quá lớn.';
  end if;
  insert into public.app_config (key, value)
    values (pref_key, pref_value)
    on conflict (key) do update set value = excluded.value;
end;
$$;

revoke all on function public.set_org_pref(text, text) from public;
grant execute on function public.set_org_pref(text, text) to authenticated;
