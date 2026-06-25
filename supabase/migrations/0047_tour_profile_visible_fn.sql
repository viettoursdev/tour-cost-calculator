-- Tách predicate "được xem hồ sơ tour" thành HÀM boolean → single source of truth
--  cho cả RLS policy lẫn pgTAP (test gọi thẳng hàm, không phụ thuộc cơ chế lọc RLS
--  của harness). Hành vi GIỮ NGUYÊN như policy ở 0046.
--
--  SECURITY INVOKER: chạy theo quyền người gọi (đọc profiles qua company-read).
--  STABLE: không đổi trong một câu lệnh.

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
    -- (4) CEO & Ban Giám Đốc thấy tất cả
    or (select role from public.profiles where id = auth.uid()) in ('CEO','Ban Giám Đốc')
    -- (5) Trưởng Phòng / Phó Phòng thấy hồ sơ do người CÙNG PHÒNG tạo
    or (
      (select role from public.profiles where id = auth.uid()) in ('Trưởng Phòng','Phó Phòng')
      and (select department from public.profiles where id = auth.uid()) is not null
      and (select department from public.profiles where id = auth.uid())
          = (select department from public.profiles where username = p_created_by)
    );
$$;

grant execute on function public.tour_profile_can_view(text, jsonb, jsonb) to authenticated, anon;

-- Dùng lại hàm trong policy đọc (thay bản inline ở 0046).
drop policy if exists tour_profiles_read on public.tour_profiles;
create policy tour_profiles_read on public.tour_profiles for select using (
  public.is_viettours_user()
  and public.tour_profile_can_view(created_by_username, collaborators, followers)
);
