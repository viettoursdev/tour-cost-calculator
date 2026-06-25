-- RLS xem tour_profiles: kiểm CẤU TRÚC + LOGIC predicate qua hàm
-- public.tour_profile_can_view (0047). Test gọi thẳng hàm với request.jwt.claims
-- của từng user → không phụ thuộc cơ chế lọc RLS của harness (pg_prove chạy bằng
-- superuser nên SET ROLE không kích hoạt row-filter; production dùng role thật vẫn lọc đúng).
begin;
select plan(10);

-- ── Cấu trúc ──
select has_column('public', 'profiles', 'department', 'profiles.department tồn tại');
select ok((select relrowsecurity from pg_class where oid = 'public.tour_profiles'::regclass), 'RLS bật trên tour_profiles');
select has_function('public', 'tour_profile_can_view', 'hàm predicate tồn tại');

-- ── Seed user qua auth.users (trigger tự tạo profiles) rồi set role/department ──
select set_config('app.bootstrap_ceo_email', 'developer@viettours.com.vn', false);
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

-- Hồ sơ "an" (nội địa): collab=binh, follow=cuong.
-- collabsA / followsA mô phỏng cột tour_profiles.collaborators/followers.

set local role authenticated;

-- an (người tạo) thấy hồ sơ mình
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"an@viettours.com.vn"}', true);
select ok(public.tour_profile_can_view('an', '[{"u":"binh","name":"Binh"}]'::jsonb, '[]'::jsonb), 'người tạo thấy hồ sơ mình');

-- binh (collaborator) thấy
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"binh@viettours.com.vn"}', true);
select ok(public.tour_profile_can_view('an', '[{"u":"binh","name":"Binh"}]'::jsonb, '[]'::jsonb), 'collaborator thấy');

-- pp (Phó Phòng cùng phòng người tạo) thấy hồ sơ của an; KHÔNG thấy hồ sơ của cuong (khác phòng)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"pp@viettours.com.vn"}', true);
select ok(public.tour_profile_can_view('an', '[]'::jsonb, '[]'::jsonb), 'Phó Phòng CÙNG phòng thấy');
select ok(not public.tour_profile_can_view('cuong', '[]'::jsonb, '[]'::jsonb), 'Phó Phòng KHÁC phòng KHÔNG thấy');

-- cuong (khác phòng, không chia sẻ) KHÔNG thấy hồ sơ của an; nhưng thấy hồ sơ mình follow
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"cuong@viettours.com.vn"}', true);
select ok(not public.tour_profile_can_view('an', '[]'::jsonb, '[]'::jsonb), 'người khác phòng, không chia sẻ → KHÔNG thấy');
select ok(public.tour_profile_can_view('an', '[]'::jsonb, '[{"u":"cuong","name":"Cuong"}]'::jsonb), 'follower thấy hồ sơ theo dõi');

-- sep (CEO) thấy mọi hồ sơ kể cả khác phòng
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","email":"sep@viettours.com.vn"}', true);
select ok(public.tour_profile_can_view('cuong', '[]'::jsonb, '[]'::jsonb), 'CEO thấy tất cả');

select * from finish();
rollback;
