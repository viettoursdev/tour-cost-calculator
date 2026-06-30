-- Siết RLS cho chat: chỉ THÀNH VIÊN của cuộc trò chuyện mới đọc/ghi được.
--
-- Trước đây (0027) mọi tài khoản @viettours.com.vn đều SELECT/UPDATE được TẤT CẢ
-- chats/chat_members/chat_messages → ai cũng đọc được DM riêng tư của người khác.
-- Migration này thay bằng kiểm tra "user là thành viên của cuộc".
--
-- Helper dùng SECURITY DEFINER để bỏ qua RLS khi truy vấn nội bộ chat_members/chats,
-- tránh đệ quy chính sách (policy của chat_members gọi hàm lại đọc chat_members).

-- Username của user đang đăng nhập (khớp profiles.id = auth.uid()).
create or replace function public.chat_current_username()
returns text
language sql stable security definer set search_path = public as $$
  select username from public.profiles where id = auth.uid()
$$;

-- User hiện tại có phải thành viên của cuộc p_chat_id?
create or replace function public.chat_is_member(p_chat_id text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chat_members m
    where m.chat_id = p_chat_id
      and m.username = public.chat_current_username()
  )
$$;

-- User hiện tại có phải người TẠO cuộc p_chat_id? (cần cho lúc tạo, khi membership
-- chưa kịp tồn tại để chat_is_member trả true).
create or replace function public.chat_is_creator(p_chat_id text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chats c
    where c.id = p_chat_id
      and c.created_by_name = public.chat_current_username()
  )
$$;

-- Bỏ các policy cũ quá rộng (chỉ kiểm is_viettours_user).
drop policy if exists chats_read           on public.chats;
drop policy if exists chats_write          on public.chats;
drop policy if exists chat_members_read    on public.chat_members;
drop policy if exists chat_members_write   on public.chat_members;
drop policy if exists chat_messages_read   on public.chat_messages;
drop policy if exists chat_messages_write  on public.chat_messages;

-- ============================ chats ============================
-- Đọc: chỉ cuộc mình là thành viên.
create policy chats_select on public.chats
  for select using (public.is_viettours_user() and public.chat_is_member(id));

-- Tạo: bất kỳ user hợp lệ, nhưng phải tự đứng tên người tạo (chống mạo danh).
create policy chats_insert on public.chats
  for insert with check (
    public.is_viettours_user()
    and created_by_name = public.chat_current_username()
  );

-- Sửa (last_*/title): thành viên hoặc người tạo.
create policy chats_update on public.chats
  for update using (
    public.is_viettours_user()
    and (public.chat_is_member(id) or public.chat_is_creator(id))
  ) with check (
    public.is_viettours_user()
    and (public.chat_is_member(id) or public.chat_is_creator(id))
  );

-- Xoá: chỉ người tạo (app hiện không dùng, để dự phòng).
create policy chats_delete on public.chats
  for delete using (public.is_viettours_user() and public.chat_is_creator(id));

-- ========================= chat_members =========================
-- Đọc: danh sách thành viên của cuộc mình tham gia (để render "đã xem"/tên nhóm).
create policy chat_members_select on public.chat_members
  for select using (public.is_viettours_user() and public.chat_is_member(chat_id));

-- Thêm thành viên: người tạo cuộc, hoặc thành viên hiện hữu (mời thêm vào nhóm).
create policy chat_members_insert on public.chat_members
  for insert with check (
    public.is_viettours_user()
    and (public.chat_is_creator(chat_id) or public.chat_is_member(chat_id))
  );

-- Cập nhật: chỉ dòng của CHÍNH MÌNH (đánh dấu đã đọc / last_read).
create policy chat_members_update on public.chat_members
  for update using (
    public.is_viettours_user() and username = public.chat_current_username()
  ) with check (
    public.is_viettours_user() and username = public.chat_current_username()
  );

-- Xoá: tự rời nhóm (dòng của mình) hoặc người tạo gỡ thành viên.
create policy chat_members_delete on public.chat_members
  for delete using (
    public.is_viettours_user()
    and (username = public.chat_current_username() or public.chat_is_creator(chat_id))
  );

-- ========================= chat_messages =========================
-- Đọc: chỉ tin trong cuộc mình tham gia.
create policy chat_messages_select on public.chat_messages
  for select using (public.is_viettours_user() and public.chat_is_member(chat_id));

-- Gửi: phải là thành viên VÀ đứng tên chính mình.
create policy chat_messages_insert on public.chat_messages
  for insert with check (
    public.is_viettours_user()
    and public.chat_is_member(chat_id)
    and by_username = public.chat_current_username()
  );

-- Sửa/thu hồi/thả cảm xúc: thành viên của cuộc (quyền tác giả siết ở tầng app).
create policy chat_messages_update on public.chat_messages
  for update using (
    public.is_viettours_user() and public.chat_is_member(chat_id)
  ) with check (
    public.is_viettours_user() and public.chat_is_member(chat_id)
  );

-- Xoá cứng: thành viên (dùng cho cắt bớt khi vượt ngưỡng 500 tin).
create policy chat_messages_delete on public.chat_messages
  for delete using (public.is_viettours_user() and public.chat_is_member(chat_id));
