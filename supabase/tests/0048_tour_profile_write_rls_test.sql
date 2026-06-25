-- RLS GHI tour_profiles (migration 0048): hàm tour_profile_can_edit.
-- Điểm then chốt khác với XEM: FOLLOWER không được SỬA (Follow chỉ xem).
begin;
select plan(7);

select has_function('public', 'tour_profile_can_edit', 'hàm predicate ghi tồn tại');

-- Seed user (trigger tạo profiles) + set role/department.
select set_config('app.bootstrap_ceo_email', 'developer@viettours.com.vn', false);
insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000000a2','an@viettours.com.vn',   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000b2','binh@viettours.com.vn', '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000c2','pp@viettours.com.vn',   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000d2','cuong@viettours.com.vn','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000e2','sep@viettours.com.vn',  '00000000-0000-0000-0000-000000000000','authenticated','authenticated');
update public.profiles set username='an',   role='Sales',      department='dh_noidia'    where id='00000000-0000-0000-0000-0000000000a2';
update public.profiles set username='binh', role='Sales',      department='dh_noidia'    where id='00000000-0000-0000-0000-0000000000b2';
update public.profiles set username='pp',   role='Phó Phòng',  department='dh_noidia'    where id='00000000-0000-0000-0000-0000000000c2';
update public.profiles set username='cuong',role='Operations', department='dh_nuocngoai' where id='00000000-0000-0000-0000-0000000000d2';
update public.profiles set username='sep',  role='CEO',        department=null           where id='00000000-0000-0000-0000-0000000000e2';

-- Hồ sơ của "an": collaborator=binh, follower=cuong (mô phỏng qua tham số hàm).
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"an@viettours.com.vn"}', true);
select ok(public.tour_profile_can_edit('an', '[{"u":"binh"}]'::jsonb), 'người tạo sửa được');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","email":"binh@viettours.com.vn"}', true);
select ok(public.tour_profile_can_edit('an', '[{"u":"binh"}]'::jsonb), 'collaborator sửa được');

-- cuong CHỈ là follower (không nằm trong collaborators) → KHÔNG sửa được hồ sơ của an
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","email":"cuong@viettours.com.vn"}', true);
select ok(not public.tour_profile_can_edit('an', '[{"u":"binh"}]'::jsonb), 'follower/khác phòng KHÔNG sửa được');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","email":"pp@viettours.com.vn"}', true);
select ok(public.tour_profile_can_edit('an', '[]'::jsonb), 'Phó Phòng cùng phòng sửa được');
select ok(not public.tour_profile_can_edit('cuong', '[]'::jsonb), 'Phó Phòng khác phòng KHÔNG sửa được');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","email":"sep@viettours.com.vn"}', true);
select ok(public.tour_profile_can_edit('cuong', '[]'::jsonb), 'CEO sửa được mọi hồ sơ');

select * from finish();
rollback;
