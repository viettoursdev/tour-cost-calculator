-- Siết quyền GHI tour_profiles xuống tầng DB (hoàn tất nửa còn lại của RLS sau 0046/0047).
--  TRƯỚC: policy write = is_viettours_user (mọi nhân viên sửa/xoá bất kỳ hồ sơ qua API).
--  SAU:
--   • INSERT: chỉ tạo hồ sơ với created_by_username = CHÍNH MÌNH.
--   • UPDATE/DELETE: người được SỬA = creator / collaborator (Collab=sửa) /
--     Trưởng-Phó Phòng cùng phòng / BGĐ-CEO. KHÔNG gồm follower (Follow chỉ XEM).
--  App đã tạo hồ sơ với created_by_username = username người dùng (khớp profiles.username
--  qua profileToUser) nên luồng tạo/auto-link ở saveCloud vẫn chạy.

create or replace function public.tour_profile_can_edit(
  p_created_by text, p_collaborators jsonb
) returns boolean
language sql stable security invoker
set search_path = public
as $$
  select
    p_created_by = (select username from public.profiles where id = auth.uid())
    or p_collaborators @> jsonb_build_array(jsonb_build_object('u', (select username from public.profiles where id = auth.uid())))
    or (select role from public.profiles where id = auth.uid()) in ('CEO','Ban Giám Đốc')
    or (
      (select role from public.profiles where id = auth.uid()) in ('Trưởng Phòng','Phó Phòng')
      and (select department from public.profiles where id = auth.uid()) is not null
      and (select department from public.profiles where id = auth.uid())
          = (select department from public.profiles where username = p_created_by)
    );
$$;

grant execute on function public.tour_profile_can_edit(text, jsonb) to authenticated, anon;

-- Thay policy "for all" cũ bằng 3 policy insert/update/delete riêng.
drop policy if exists tour_profiles_write on public.tour_profiles;

create policy tour_profiles_insert on public.tour_profiles for insert
  with check (
    public.is_viettours_user()
    and created_by_username = (select username from public.profiles where id = auth.uid())
  );

create policy tour_profiles_update on public.tour_profiles for update
  using (public.is_viettours_user() and public.tour_profile_can_edit(created_by_username, collaborators))
  with check (public.is_viettours_user() and public.tour_profile_can_edit(created_by_username, collaborators));

create policy tour_profiles_delete on public.tour_profiles for delete
  using (public.is_viettours_user() and public.tour_profile_can_edit(created_by_username, collaborators));
