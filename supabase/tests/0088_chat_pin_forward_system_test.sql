-- Cột ghim/hệ thống/chuyển tiếp trên chat_messages (0088).
begin;
select plan(6);

select has_column('public', 'chat_messages', 'pinned', 'chat_messages.pinned tồn tại');
select col_type_is('public', 'chat_messages', 'pinned', 'boolean', 'pinned là boolean');
select has_column('public', 'chat_messages', 'is_system', 'chat_messages.is_system tồn tại');
select col_type_is('public', 'chat_messages', 'is_system', 'boolean', 'is_system là boolean');
select has_column('public', 'chat_messages', 'forwarded_from', 'chat_messages.forwarded_from tồn tại');
select col_type_is('public', 'chat_messages', 'forwarded_from', 'text', 'forwarded_from là text');

select * from finish();
rollback;
