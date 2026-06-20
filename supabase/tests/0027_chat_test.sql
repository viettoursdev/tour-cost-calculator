begin;
select plan(10);

-- Tables exist
select has_table('public','chats','chats table exists');
select has_table('public','chat_members','chat_members table exists');
select has_table('public','chat_messages','chat_messages table exists');

-- chats PK is text
select col_is_pk('public','chats','id','chats.id is PK');
select col_type_is('public','chats','id','text','chats.id is text');

-- chat_members composite PK (chat_id, username)
select col_is_pk('public','chat_members',array['chat_id','username'],'chat_members PK is (chat_id,username)');

-- FK: chat_messages.chat_id → chats.id
select fk_ok('public','chat_messages','chat_id','public','chats','id');

-- RLS enabled on all three
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('chats','chat_members','chat_messages')
      and c.relrowsecurity = true),
  3,
  'RLS enabled on chats, chat_members, chat_messages');

-- chat_messages in supabase_realtime
select is(
  (select count(*)::int from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='chat_messages'),
  1, 'chat_messages is in supabase_realtime');

-- chats in supabase_realtime
select is(
  (select count(*)::int from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='chats'),
  1, 'chats is in supabase_realtime');

select * from finish();
rollback;
