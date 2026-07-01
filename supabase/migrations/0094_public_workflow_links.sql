-- Link công khai để KHÁCH xem TIẾN ĐỘ vận hành tour (Quy trình điều hành).
-- Mirror public_visa_lists (0059): link CHỈ hoạt động sau khi người có quyền
-- (CEO / Ban Giám Đốc / Trợ lý Giám Đốc / Trưởng Phòng) DUYỆT. Nhân viên gửi yêu
-- cầu (status='pending'); duyệt xong anon mới đọc được `payload`.
--
-- `payload` là bản HƯỚNG KHÁCH đã lọc sẵn (chỉ mốc + trạng thái + % + ngày) —
-- KHÔNG kéo trường nội bộ (người phụ trách/ghi chú/rủi ro/NCC/nhật ký) ra ngoài.
-- Mỗi báo giá giữ TỐI ĐA một link (quote_id unique).

create table public.public_workflow_links (
  token                 text primary key,
  quote_id              text not null unique,   -- cloud_id của báo giá
  payload               jsonb not null,         -- PublicWorkflowDoc (đã lọc hướng khách)
  note                  text,
  status                text not null default 'pending'
                          check (status in ('pending', 'approved', 'rejected', 'revoked')),
  requested_by          uuid references public.profiles(id),
  requested_by_username text,
  requested_by_name     text,
  requested_at          timestamptz not null default now(),
  approved_by           uuid references public.profiles(id),
  approved_by_name      text,
  approved_at           timestamptz,
  reject_reason         text,
  created_at            timestamptz not null default now()
);

alter table public.public_workflow_links enable row level security;

-- Người trong công ty: đọc / tạo yêu cầu / gỡ. DUYỆT đi qua RPC định danh bên dưới.
create policy public_workflow_links_write on public.public_workflow_links for all
  using (public.is_viettours_user()) with check (public.is_viettours_user());

-- Ai được DUYỆT: CEO, Ban Giám Đốc, Trợ lý Giám Đốc, Trưởng Phòng.
create or replace function public.can_approve_workflow_share()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role in ('CEO', 'Ban Giám Đốc', 'Trợ lý Giám Đốc', 'Trưởng Phòng')
  );
$$;

-- Duyệt link (chỉ người duyệt hợp lệ). pending → approved.
create or replace function public.approve_workflow_link(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_viettours_user() then
    raise exception 'Không có quyền.';
  end if;
  if not public.can_approve_workflow_share() then
    raise exception 'Chỉ CEO / Ban Giám Đốc / Trợ lý Giám Đốc / Trưởng Phòng mới được duyệt link.';
  end if;
  update public.public_workflow_links
     set status = 'approved',
         approved_by = auth.uid(),
         approved_by_name = (select name from public.profiles where id = auth.uid()),
         approved_at = now(),
         reject_reason = null
   where token = p_token and status = 'pending';
  if not found then
    raise exception 'Không tìm thấy yêu cầu đang chờ duyệt.';
  end if;
end;
$$;

-- Từ chối link (chỉ người duyệt hợp lệ). pending → rejected (+ lý do).
create or replace function public.reject_workflow_link(p_token text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_viettours_user() then
    raise exception 'Không có quyền.';
  end if;
  if not public.can_approve_workflow_share() then
    raise exception 'Chỉ CEO / Ban Giám Đốc / Trợ lý Giám Đốc / Trưởng Phòng mới được duyệt link.';
  end if;
  update public.public_workflow_links
     set status = 'rejected',
         approved_by = auth.uid(),
         approved_by_name = (select name from public.profiles where id = auth.uid()),
         approved_at = now(),
         reject_reason = p_reason
   where token = p_token and status = 'pending';
  if not found then
    raise exception 'Không tìm thấy yêu cầu đang chờ duyệt.';
  end if;
end;
$$;

grant execute on function public.can_approve_workflow_share() to authenticated;
grant execute on function public.approve_workflow_link(text) to authenticated;
grant execute on function public.reject_workflow_link(text, text) to authenticated;

-- Anon đọc tiến độ qua token — CHỈ khi đã được duyệt. SECURITY DEFINER để không
-- cần cấp SELECT toàn bảng cho anon (chống dò token / liệt kê báo giá).
create or replace function public.get_public_workflow(p_token text)
returns table(payload jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select payload from public.public_workflow_links
   where token = p_token and status = 'approved';
$$;

grant execute on function public.get_public_workflow(text) to anon;
