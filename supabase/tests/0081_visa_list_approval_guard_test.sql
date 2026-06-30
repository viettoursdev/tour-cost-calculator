-- Trigger chặn TỰ DUYỆT link danh sách visa (0081). Kiểm trực tiếp hành vi trigger
-- bằng cách set request.jwt.claims theo từng user (pg_prove chạy superuser nên RLS
-- row-filter không kích hoạt, NHƯNG trigger BEFORE UPDATE vẫn luôn chạy — đúng cái cần test).
begin;
select plan(6);

-- ── Cấu trúc ──
select has_function('public', 'guard_visa_list_approval', 'hàm trigger guard tồn tại');
select ok(
  exists(select 1 from pg_trigger
          where tgname = 'trg_guard_visa_list_approval'
            and tgrelid = 'public.public_visa_lists'::regclass),
  'trigger gắn vào public_visa_lists');

-- ── Seed user qua auth.users (trigger handle_new_user tự tạo profiles) rồi set role ──
insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000fa001','sales@viettours.com.vn', '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000fb001','tpvisa@viettours.com.vn','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
update public.profiles set username='sales',  role='Sales',        department='dh_noidia' where id='00000000-0000-0000-0000-0000000fa001';
update public.profiles set username='tpvisa', role='Trưởng Phòng', department='visa'      where id='00000000-0000-0000-0000-0000000fb001';

-- Một link đang chờ duyệt
insert into public.public_visa_lists (token, project_id, payload, status)
  values ('vtok1', 'projX', '{"rows":[]}'::jsonb, 'pending');

-- ① Nhân viên thường KHÔNG được tự duyệt (status → approved) qua UPDATE trực tiếp
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000fa001","email":"sales@viettours.com.vn"}', true);
select throws_ok(
  $$update public.public_visa_lists set status = 'approved' where token = 'vtok1'$$,
  NULL,
  'nhân viên thường KHÔNG tự duyệt được (trigger chặn)');

-- ② Nhân viên thường VẪN refresh payload được (status không đổi)
select lives_ok(
  $$update public.public_visa_lists set payload = '{"rows":[1]}'::jsonb where token = 'vtok1'$$,
  'refresh payload (status giữ pending) vẫn được');

-- ③ Nhân viên thường VẪN gỡ link được (→ revoked)
select lives_ok(
  $$update public.public_visa_lists set status = 'revoked' where token = 'vtok1'$$,
  'gỡ link (→ revoked) vẫn được');

-- ④ Trưởng phòng Visa duyệt được (→ approved). Đưa lại pending trước (→pending hợp lệ).
update public.public_visa_lists set status = 'pending' where token = 'vtok1';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000fb001","email":"tpvisa@viettours.com.vn"}', true);
select lives_ok(
  $$update public.public_visa_lists set status = 'approved' where token = 'vtok1'$$,
  'Trưởng phòng Visa duyệt được');

select * from finish();
rollback;
