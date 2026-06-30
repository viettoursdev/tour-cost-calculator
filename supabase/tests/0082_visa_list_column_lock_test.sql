-- Khoá bộ cột của link visa ĐÃ DUYỆT (0082). Kiểm trực tiếp trigger BEFORE UPDATE
-- (pg_prove chạy superuser → RLS không lọc, nhưng trigger luôn chạy — đúng cái cần test).
begin;
select plan(5);

-- ── Seed: 1 link ĐÃ DUYỆT với allowlist 2 cột name + passport ──
insert into public.public_visa_lists (token, project_id, columns, payload, status)
  values (
    'ctok1', 'projC',
    array['name','passport'],
    '{"columns":[{"key":"name"},{"key":"passport"}],"rows":[]}'::jsonb,
    'approved');

-- ① Refresh số liệu GIỮ nguyên bộ cột → CHO PHÉP
select lives_ok(
  $$update public.public_visa_lists
       set payload = '{"columns":[{"key":"name"},{"key":"passport"}],"rows":[[1]]}'::jsonb
     where token = 'ctok1'$$,
  'refresh số liệu cùng bộ cột vẫn được');

-- ② BỚT cột (chỉ còn name) → CHO PHÉP (không lộ thêm gì)
select lives_ok(
  $$update public.public_visa_lists
       set payload = '{"columns":[{"key":"name"}],"rows":[]}'::jsonb
     where token = 'ctok1'$$,
  'bớt cột vẫn được');

-- ③ THÊM cột mới trong payload (salary) → CHẶN (phải duyệt lại)
select throws_ok(
  $$update public.public_visa_lists
       set payload = '{"columns":[{"key":"name"},{"key":"salary"}],"rows":[]}'::jsonb
     where token = 'ctok1'$$,
  NULL,
  'thêm cột mới vào payload link đã duyệt bị chặn');

-- ④ Nới trực tiếp allowlist columns[] khi đang approved → CHẶN
select throws_ok(
  $$update public.public_visa_lists
       set columns = array['name','passport','salary']
     where token = 'ctok1'$$,
  NULL,
  'nới allowlist columns[] khi đang duyệt bị chặn');

-- ⑤ Hạ về 'pending' kèm bộ cột mới (để gửi duyệt lại) → CHO PHÉP
select lives_ok(
  $$update public.public_visa_lists
       set status = 'pending',
           columns = array['name','passport','salary'],
           payload = '{"columns":[{"key":"name"},{"key":"passport"},{"key":"salary"}],"rows":[]}'::jsonb
     where token = 'ctok1'$$,
  'hạ về pending kèm cột mới (chờ duyệt lại) vẫn được');

select * from finish();
rollback;
