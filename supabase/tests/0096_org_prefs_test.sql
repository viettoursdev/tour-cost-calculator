-- RPC set_org_pref (migration 0096): gate ghi tùy chọn cấp tổ chức vào app_config.
-- Trưởng/Phó Phòng chỉ đặt nav_preset cho phòng MÌNH; module_flags chỉ BGĐ+.
begin;
select plan(12);

select has_function('public', 'set_org_pref', 'RPC set_org_pref tồn tại');

-- Seed user (trigger tạo profiles) + set role/department.
select set_config('app.bootstrap_ceo_email', 'developer@viettours.com.vn', false);
insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000000a6','tpvisa@viettours.com.vn','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000b6','ppnd@viettours.com.vn',  '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000c6','sale@viettours.com.vn',  '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('00000000-0000-0000-0000-0000000000d6','bgd@viettours.com.vn',   '00000000-0000-0000-0000-000000000000','authenticated','authenticated');
update public.profiles set username='tpvisa', role='Trưởng Phòng', department='visa'      where id='00000000-0000-0000-0000-0000000000a6';
update public.profiles set username='ppnd',   role='Phó Phòng',    department='dh_noidia' where id='00000000-0000-0000-0000-0000000000b6';
update public.profiles set username='sale',   role='Sales',        department='dh_noidia' where id='00000000-0000-0000-0000-0000000000c6';
update public.profiles set username='bgd',    role='Ban Giám Đốc', department=null        where id='00000000-0000-0000-0000-0000000000d6';

set local role authenticated;

-- Trưởng Phòng visa: đặt được preset phòng mình, KHÔNG đặt được phòng khác.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a6","email":"tpvisa@viettours.com.vn"}', true);
select lives_ok($$select public.set_org_pref('nav_preset_visa', '{"top":[]}')$$, 'TP đặt preset phòng mình OK');
select throws_ok($$select public.set_org_pref('nav_preset_ketoan', '{"top":[]}')$$, 'Chỉ Trưởng/Phó Phòng của phòng hoặc Ban Giám Đốc mới được đặt bố cục phòng.', 'TP KHÔNG đặt được preset phòng khác');
select throws_ok($$select public.set_org_pref('module_flags', '{}')$$, 'Chỉ Ban Giám Đốc trở lên mới được cấu hình module.', 'TP KHÔNG cấu hình được module');

-- Phó Phòng nội địa: đặt được preset phòng mình.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b6","email":"ppnd@viettours.com.vn"}', true);
select lives_ok($$select public.set_org_pref('nav_preset_dh_noidia', '{"top":["home"]}')$$, 'PP đặt preset phòng mình OK');

-- Sales: KHÔNG đặt được gì (kể cả phòng mình).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c6","email":"sale@viettours.com.vn"}', true);
select throws_ok($$select public.set_org_pref('nav_preset_dh_noidia', '{"top":[]}')$$, 'Chỉ Trưởng/Phó Phòng của phòng hoặc Ban Giám Đốc mới được đặt bố cục phòng.', 'Sales KHÔNG đặt được preset');
select throws_ok($$select public.set_org_pref('module_flags', '{}')$$, 'Chỉ Ban Giám Đốc trở lên mới được cấu hình module.', 'Sales KHÔNG cấu hình được module');

-- BGĐ: đặt preset phòng bất kỳ + module_flags; khoá lạ bị chặn.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d6","email":"bgd@viettours.com.vn"}', true);
select lives_ok($$select public.set_org_pref('nav_preset_ketoan', '{"top":[]}')$$, 'BGĐ đặt preset phòng bất kỳ OK');
select lives_ok($$select public.set_org_pref('module_flags', '{"inventory":{"offDepts":["visa"]}}')$$, 'BGĐ cấu hình module OK');
select throws_ok($$select public.set_org_pref('bootstrap_ceo_email', 'hack@x.com')$$, 'Khoá cấu hình không hợp lệ.', 'khoá ngoài whitelist bị chặn');

-- value rỗng = xoá.
select lives_ok($$select public.set_org_pref('nav_preset_ketoan', '')$$, 'value rỗng xoá được');
select is(
  (select count(*)::int from public.app_config where key = 'nav_preset_ketoan'),
  0, 'row đã bị xoá'
);

select * from finish();
rollback;
