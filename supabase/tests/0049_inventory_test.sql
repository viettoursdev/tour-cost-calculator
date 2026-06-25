-- Quản lý kho (migrations 0049 + 0050): RPC sinh mã, nhập lô, xuất FIFO, tài sản.
begin;
select plan(16);

select has_function('public', 'inventory_next_item_code', 'RPC sinh mã sản phẩm tồn tại');
select has_function('public', 'inventory_receive_lot', 'RPC nhập lô tồn tại');
select has_function('public', 'inventory_issue', 'RPC xuất FIFO tồn tại');
select has_function('public', 'inventory_adjust', 'RPC điều chỉnh tồn tại');
select has_function('public', 'inventory_next_asset_code', 'RPC sinh mã tài sản tồn tại');
select has_function('public', 'inventory_asset_action', 'RPC thao tác tài sản tồn tại');

-- Cổng @viettours cho các RPC security-definer (đọc auth.jwt()->>'email').
select set_config('request.jwt.claims', '{"email":"dev@viettours.com.vn"}', true);

-- Seed loại + sản phẩm (insert thẳng — superuser bỏ qua RLS).
insert into public.inventory_categories(id, code, name, kind) values ('cat_t', 'AO', 'Áo', 'consumable');
insert into public.inventory_items(id, code, category_id, name, sizes) values ('itm_t', 'AO-001', 'cat_t', 'Áo thun', array['M','L']);

select is(public.inventory_next_item_code('cat_t'), 'AO-001', 'sinh mã item đầu tiên = AO-001');

-- Lô 1 màu Đỏ: M=10, L=5 @ 100.
select public.inventory_receive_lot('itm_t', 'Đỏ', 'DO', 100, 'NCC A', current_date, '',
  '[{"size":"M","qty":10},{"size":"L","qty":5}]'::jsonb, 'tester');
select is(
  (select sum(qty_remaining)::int from public.inventory_lot_lines ll
     join public.inventory_lots l on l.id = ll.lot_id where l.item_id = 'itm_t'),
  15, 'tồn sau nhập lô 1 = 15');

-- Lô 2 màu Đỏ (mới hơn): M=4 @ 120.
select public.inventory_receive_lot('itm_t', 'Đỏ', 'DO', 120, 'NCC A', current_date, '',
  '[{"size":"M","qty":4}]'::jsonb, 'tester');

-- Xuất 12 áo Đỏ M: FIFO lấy hết 10 lô cũ + 2 lô mới.
select public.inventory_issue('itm_t', 'Đỏ', 'M', 12, 'cấp tour', 'T1', now(), 'tester');
select is(
  (select qty_remaining from public.inventory_lot_lines ll join public.inventory_lots l on l.id = ll.lot_id
    where l.item_id = 'itm_t' and l.unit_cost = 100 and ll.size = 'M'),
  0, 'FIFO: lô cũ M về 0');
select is(
  (select qty_remaining from public.inventory_lot_lines ll join public.inventory_lots l on l.id = ll.lot_id
    where l.item_id = 'itm_t' and l.unit_cost = 120 and ll.size = 'M'),
  2, 'FIFO: lô mới M còn 2');

-- Xuất quá tồn → lỗi.
select throws_ok($$ select public.inventory_issue('itm_t', 'Đỏ', 'M', 99, 'x', '', now(), 't') $$,
  NULL, 'xuất vượt tồn bị chặn');

-- Xuất 12 trải 2 lô (10 lô cũ + 2 lô mới) → FIFO ghi 2 dòng movement xuất.
select is(
  (select count(*)::int from public.inventory_movements where item_id = 'itm_t' and type = 'out'),
  2, 'FIFO ghi 2 movement xuất theo 2 lô');

-- Đợt 4: xuất gắn tour → lưu tour_code (tour_profile_id NULL để né FK trong test).
select public.inventory_issue('itm_t', 'Đỏ', 'M', 1, 'cấp tour', 'T2', now(), 'tester', NULL, 'NĐ.01.01.25.99');
select is(
  (select count(*)::int from public.inventory_movements where item_id = 'itm_t' and type = 'out' and tour_code = 'NĐ.01.01.25.99'),
  1, 'xuất gắn tour lưu tour_code');

-- Tài sản theo từng cái.
insert into public.inventory_categories(id, code, name, kind) values ('cat_tb', 'TB', 'Thiết bị', 'asset');
insert into public.inventory_items(id, code, category_id, name) values ('itm_tb', 'TB-001', 'cat_tb', 'Máy chiếu');
select is(public.inventory_next_asset_code('itm_tb'), 'TB-001-001', 'sinh mã tài sản TB-001-001');

insert into public.inventory_assets(id, code, item_id, name, status) values ('ast_t', 'TB-001-001', 'itm_tb', 'Máy chiếu', 'available');
select public.inventory_asset_action('ast_t', 'checkout', 'in_use', 'Anh A', 'tour X', 'T1', now(), 'tester');
select is((select status from public.inventory_assets where id = 'ast_t'), 'in_use', 'cấp phát → đang dùng');
select is((select count(*)::int from public.inventory_asset_logs where asset_id = 'ast_t'), 1, 'ghi 1 log thao tác');

select * from finish();
rollback;
