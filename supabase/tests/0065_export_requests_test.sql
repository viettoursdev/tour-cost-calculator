-- Cổng DUYỆT XUẤT FILE (migration 0065): bảng export_requests + hàm
-- is_export_approver + RPC approve/reject_export_request.
-- Người duyệt = CEO / Ban Giám Đốc / Trưởng Phòng (TRÙNG APPROVER_ROLES app);
-- Phó Phòng / Sales / Operations KHÔNG duyệt được. Test gọi THẲNG predicate +
-- RPC với set_config('request.jwt.claims', …) như 0048 (KHÔNG dựa SET ROLE để lọc).
begin;
select plan(18);

select has_table('public', 'export_requests', 'bảng export_requests tồn tại');
select has_function('public', 'is_export_approver', 'hàm predicate người duyệt tồn tại');
select has_function('public', 'approve_export_request', 'RPC duyệt tồn tại');
select has_function('public', 'reject_export_request', 'RPC từ chối tồn tại');

-- Seed user (trigger tạo profiles) + set role. bootstrap = email KHÔNG seed để
-- không tự nâng user đầu thành CEO; sau đó UPDATE role tường minh.
select set_config('app.bootstrap_ceo_email', 'developer@viettours.com.vn', false);
insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000000a5','sep@viettours.com.vn',  '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000b5','bgd@viettours.com.vn',  '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000c5','tp@viettours.com.vn',   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000d5','pp@viettours.com.vn',   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000e5','sale@viettours.com.vn', '00000000-0000-0000-0000-000000000000','authenticated','authenticated');
update public.profiles set username='sep',  role='CEO'            where id='00000000-0000-0000-0000-0000000000a5';
update public.profiles set username='bgd',  role='Ban Giám Đốc'  where id='00000000-0000-0000-0000-0000000000b5';
update public.profiles set username='tp',   role='Trưởng Phòng'  where id='00000000-0000-0000-0000-0000000000c5';
update public.profiles set username='pp',   role='Phó Phòng'     where id='00000000-0000-0000-0000-0000000000d5';
update public.profiles set username='sale', role='Sales'         where id='00000000-0000-0000-0000-0000000000e5';

-- Seed 2 yêu cầu đang chờ (chèn trước khi đổi role → superuser bỏ qua RLS).
insert into public.export_requests (id, scope, detail, status, requested_by) values
  ('xr_t1', 'tour_profiles', '3 hồ sơ tour', 'pending', '00000000-0000-0000-0000-0000000000e5'),
  ('xr_t2', 'tour_profiles', '5 hồ sơ tour', 'pending', '00000000-0000-0000-0000-0000000000e5');

set local role authenticated;

-- ── is_export_approver theo từng vai trò ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5","email":"sep@viettours.com.vn"}', true);
select ok(public.is_export_approver(), 'CEO là người duyệt');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b5","email":"bgd@viettours.com.vn"}', true);
select ok(public.is_export_approver(), 'Ban Giám Đốc là người duyệt');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","email":"tp@viettours.com.vn"}', true);
select ok(public.is_export_approver(), 'Trưởng Phòng là người duyệt');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d5","email":"pp@viettours.com.vn"}', true);
select ok(not public.is_export_approver(), 'Phó Phòng KHÔNG phải người duyệt');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e5","email":"sale@viettours.com.vn"}', true);
select ok(not public.is_export_approver(), 'Sales KHÔNG phải người duyệt');

-- ── RPC duyệt: người dưới quyền bị chặn ──
select throws_ok($$ select public.approve_export_request('xr_t1') $$,
  NULL, 'Sales duyệt xuất bị chặn');

-- ── RPC duyệt: Trưởng Phòng duyệt thành công ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","email":"tp@viettours.com.vn"}', true);
select lives_ok($$ select public.approve_export_request('xr_t1') $$, 'Trưởng Phòng duyệt được');
select is((select status from public.export_requests where id='xr_t1'), 'approved', 'xr_t1 → approved');
select is((select decided_by_name from public.export_requests where id='xr_t1'),
  (select name from public.profiles where id='00000000-0000-0000-0000-0000000000c5'), 'ghi tên người duyệt');

-- Duyệt lại yêu cầu KHÔNG còn pending → lỗi (where status='pending' không khớp).
select throws_ok($$ select public.approve_export_request('xr_t1') $$,
  NULL, 'duyệt lại yêu cầu đã xử lý bị chặn');

-- ── RPC từ chối: Sales bị chặn, Trưởng Phòng từ chối được (+ lý do) ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e5","email":"sale@viettours.com.vn"}', true);
select throws_ok($$ select public.reject_export_request('xr_t2', 'không') $$,
  NULL, 'Sales từ chối xuất bị chặn');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","email":"tp@viettours.com.vn"}', true);
select lives_ok($$ select public.reject_export_request('xr_t2', 'Dữ liệu nhạy cảm') $$, 'Trưởng Phòng từ chối được');
select is((select status from public.export_requests where id='xr_t2'), 'rejected', 'xr_t2 → rejected');
select is((select reject_reason from public.export_requests where id='xr_t2'), 'Dữ liệu nhạy cảm', 'lưu lý do từ chối');

select * from finish();
rollback;
