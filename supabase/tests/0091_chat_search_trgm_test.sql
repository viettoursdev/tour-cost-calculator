-- Index trigram cho tìm kiếm tin nhắn (0091).
begin;
select plan(1);

select has_index('public', 'chat_messages', 'chat_messages_text_trgm', 'index trigram nội dung tin tồn tại');

select * from finish();
rollback;
