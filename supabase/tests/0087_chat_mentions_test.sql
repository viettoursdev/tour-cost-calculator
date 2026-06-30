-- Cột mentions trên chat_messages (0087).
begin;
select plan(2);

select has_column('public', 'chat_messages', 'mentions', 'chat_messages.mentions tồn tại');
select col_type_is('public', 'chat_messages', 'mentions', 'jsonb', 'chat_messages.mentions là jsonb');

select * from finish();
rollback;
