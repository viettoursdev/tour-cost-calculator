-- Thư viện Viettours Đợt 4: SIẾT quyền đọc kho theo PHÒNG BAN (thay RLS mở của 0067).
-- Quy tắc xem một nguồn (kb_can_view), mirror pattern tour_profile_can_view (0047):
--   • department IS NULL  → chia sẻ TOÀN CÔNG TY (mọi nhân viên thấy)
--   • người tạo            → luôn thấy (chống khoá cứng)
--   • CEO / Ban Giám Đốc   → thấy tất cả
--   • cùng phòng (gồm Trưởng/Phó Phòng của phòng đó) → thấy nguồn của phòng mình
-- Lookup department/role của NGƯỜI GỌI qua profiles theo auth.uid() (đã sync từ 0046).

create or replace function public.kb_can_view(p_department text, p_created_by text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    p_department is null
    or p_created_by = (select username from public.profiles where id = auth.uid())
    or (select role from public.profiles where id = auth.uid()) in ('CEO', 'Ban Giám Đốc')
    or (
      (select department from public.profiles where id = auth.uid()) is not null
      and (select department from public.profiles where id = auth.uid()) = p_department
    );
$$;

grant execute on function public.kb_can_view(text, text) to authenticated;

-- Nguồn: đọc/ghi chỉ khi xem được (người tạo luôn xem được nên tự nạp không bị chặn).
drop policy if exists kb_sources_rw on public.kb_sources;
create policy kb_sources_rw on public.kb_sources
  for all
  using (public.is_viettours_user() and public.kb_can_view(department, created_by))
  with check (public.is_viettours_user() and public.kb_can_view(department, created_by));

-- Khối: gắn theo nguồn cha — chỉ thao tác được nếu nguồn cha xem được. Chặn đọc trộm
-- khối của nguồn khác phòng qua ID trực tiếp (getSourceChunks).
drop policy if exists kb_chunks_rw on public.kb_chunks;
create policy kb_chunks_rw on public.kb_chunks
  for all
  using (
    public.is_viettours_user()
    and exists (
      select 1 from public.kb_sources s
      where s.id = source_id and public.kb_can_view(s.department, s.created_by)
    )
  )
  with check (
    public.is_viettours_user()
    and exists (
      select 1 from public.kb_sources s
      where s.id = source_id and public.kb_can_view(s.department, s.created_by)
    )
  );
