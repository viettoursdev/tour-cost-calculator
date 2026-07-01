-- Tìm kiếm tin nhắn toàn cục: index trigram cho ILIKE '%q%' trên nội dung tin.
-- RLS 0086 (chat_is_member) vẫn giới hạn kết quả về các cuộc user là thành viên.
create extension if not exists pg_trgm;

create index if not exists chat_messages_text_trgm
  on public.chat_messages using gin (text gin_trgm_ops);
