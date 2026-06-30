-- RLS chat theo THÀNH VIÊN (0086): kiểm LOGIC predicate qua các hàm
-- public.chat_is_member / chat_is_creator / chat_current_username bằng cách gọi
-- thẳng với request.jwt.claims của từng user (pg_prove chạy superuser nên SET ROLE
-- không kích hoạt row-filter; production dùng role thật vẫn lọc đúng).
begin;
select plan(12);

-- ── Hàm predicate tồn tại ──
select has_function('public', 'chat_current_username', 'hàm chat_current_username tồn tại');
select has_function('public', 'chat_is_member',  array['text'], 'hàm chat_is_member(text) tồn tại');
select has_function('public', 'chat_is_creator', array['text'], 'hàm chat_is_creator(text) tồn tại');

-- ── Policy mới đã thay policy cũ ──
select isnt((select count(*)::int from pg_policies
  where schemaname='public' and tablename='chats' and policyname='chats_select'), 0,
  'policy chats_select tồn tại');
select isnt((select count(*)::int from pg_policies
  where schemaname='public' and tablename='chat_messages' and policyname='chat_messages_select'), 0,
  'policy chat_messages_select tồn tại');

-- ── Seed user qua auth.users (trigger tự tạo profiles) ──
select set_config('app.bootstrap_ceo_email', 'developer@viettours.com.vn', false);
insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000a1ce0','alice@viettours.com.vn','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000b0b00','bob@viettours.com.vn',  '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000ca201','carol@viettours.com.vn','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
update public.profiles set username='alice' where id='00000000-0000-0000-0000-0000000a1ce0';
update public.profiles set username='bob'   where id='00000000-0000-0000-0000-0000000b0b00';
update public.profiles set username='carol' where id='00000000-0000-0000-0000-0000000ca201';

-- ── Cuộc DM alice↔bob (alice là người tạo). carol KHÔNG phải thành viên. ──
insert into public.chats (id, is_group, created_by, created_by_name)
  values ('dm_alice__bob', false, '00000000-0000-0000-0000-0000000a1ce0', 'alice');
insert into public.chat_members (chat_id, user_id, username) values
  ('dm_alice__bob', '00000000-0000-0000-0000-0000000a1ce0', 'alice'),
  ('dm_alice__bob', '00000000-0000-0000-0000-0000000b0b00', 'bob');

set local role authenticated;

-- alice: người tạo + thành viên
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a1ce0","email":"alice@viettours.com.vn"}', true);
select is(public.chat_current_username(), 'alice', 'username hiện tại = alice');
select ok(public.chat_is_member('dm_alice__bob'),  'alice là thành viên');
select ok(public.chat_is_creator('dm_alice__bob'), 'alice là người tạo');

-- bob: thành viên nhưng không phải người tạo
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b0b00","email":"bob@viettours.com.vn"}', true);
select ok(public.chat_is_member('dm_alice__bob'),       'bob là thành viên');
select ok(not public.chat_is_creator('dm_alice__bob'),  'bob KHÔNG phải người tạo');

-- carol: KHÔNG phải thành viên → KHÔNG đọc được DM của người khác (lỗ hổng đã vá)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000ca201","email":"carol@viettours.com.vn"}', true);
select is(public.chat_current_username(), 'carol', 'username hiện tại = carol');
select ok(not public.chat_is_member('dm_alice__bob'), 'người NGOÀI cuộc KHÔNG phải thành viên → không đọc được');

select * from finish();
rollback;
