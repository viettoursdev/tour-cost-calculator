-- RLS xem tour_profiles (migration 0046) + cột profiles.department + role 'Phó Phòng'.
-- Mô phỏng nhiều user (sub claim) ở các phòng/vai trò khác nhau, kiểm phạm vi thấy.
begin;
select plan(9);

-- ── Cấu trúc ──
select has_column('public', 'profiles', 'department', 'profiles.department tồn tại');
select ok((select relrowsecurity from pg_class where oid = 'public.tour_profiles'::regclass), 'RLS bật trên tour_profiles');

-- GUC bootstrap (trigger handle_new_user đọc; tránh phụ thuộc ALTER DATABASE).
select set_config('app.bootstrap_ceo_email', 'developer@viettours.com.vn', false);

-- ── Seed user qua auth.users (trigger tự tạo profiles) rồi set role/department ──
-- an, binh: Sales phòng nội địa · pp: Phó Phòng nội địa · cuong: Operations nước ngoài · sep: CEO
insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1','an@viettours.com.vn',   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000b1','binh@viettours.com.vn', '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000c1','pp@viettours.com.vn',   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000d1','cuong@viettours.com.vn','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000e1','sep@viettours.com.vn',  '00000000-0000-0000-0000-000000000000','authenticated','authenticated');

update public.profiles set username='an',   role='Sales',      department='dh_noidia'    where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set username='binh', role='Sales',      department='dh_noidia'    where id='00000000-0000-0000-0000-0000000000b1';
update public.profiles set username='pp',   role='Phó Phòng',  department='dh_noidia'    where id='00000000-0000-0000-0000-0000000000c1';  -- cũng kiểm enum 'Phó Phòng'
update public.profiles set username='cuong',role='Operations', department='dh_nuocngoai' where id='00000000-0000-0000-0000-0000000000d1';
update public.profiles set username='sep',  role='CEO',        department=null           where id='00000000-0000-0000-0000-0000000000e1';

-- ── Hồ sơ tour (insert ở vai superuser → bỏ qua RLS) ──
insert into public.tour_profiles (id, code, created_by_username, collaborators, followers) values
  ('tp_an_1',  'NĐ.TEST.01', 'an',    '[{"u":"binh","name":"Binh"}]'::jsonb, '[]'::jsonb),
  ('tp_an_2',  'NĐ.TEST.02', 'an',    '[]'::jsonb, '[{"u":"cuong","name":"Cuong"}]'::jsonb),
  ('tp_cuong', 'NN.TEST.01', 'cuong', '[]'::jsonb, '[]'::jsonb);

-- ── Impersonate authenticated + đổi sub theo từng user ──
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"an@viettours.com.vn"}', true);
select is((select count(*)::int from public.tour_profiles where id='tp_an_1'), 1, 'người tạo (an) thấy hồ sơ mình');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"binh@viettours.com.vn"}', true);
select is((select count(*)::int from public.tour_profiles where id='tp_an_1'), 1, 'collaborator (binh) thấy hồ sơ được chia sẻ');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"pp@viettours.com.vn"}', true);
select is((select count(*)::int from public.tour_profiles where id='tp_an_1'), 1, 'Phó Phòng CÙNG phòng thấy hồ sơ người trong phòng');
select is((select count(*)::int from public.tour_profiles where id='tp_cuong'), 0, 'Phó Phòng KHÁC phòng KHÔNG thấy');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"cuong@viettours.com.vn"}', true);
select is((select count(*)::int from public.tour_profiles where id='tp_an_1'), 0, 'người khác phòng, không chia sẻ → KHÔNG thấy');
select is((select count(*)::int from public.tour_profiles where id='tp_an_2'), 1, 'follower (cuong) thấy hồ sơ theo dõi');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","email":"sep@viettours.com.vn"}', true);
select is((select count(*)::int from public.tour_profiles where id in ('tp_an_1','tp_an_2','tp_cuong')), 3, 'CEO thấy tất cả');

select * from finish();
rollback;
