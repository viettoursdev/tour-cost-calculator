-- @mention trong chat: lưu danh sách username được nhắc trên mỗi tin (jsonb mảng).
-- Dùng để tô sáng tên được nhắc + gửi thông báo cho người được nhắc.
alter table public.chat_messages
  add column if not exists mentions jsonb not null default '[]'::jsonb;
