-- 0056 — Nâng cấp Hồ sơ tour: cột mới (category/event_staff/delete_request) +
-- next_tour_code sinh đúng prefix cho 5 loại (NĐ/NN/VS/EV/DV) + tương thích kind cũ.
begin;
select plan(12);

-- ── Cấu trúc cột mới ──
select has_column('public', 'tour_profiles', 'category', 'tour_profiles.category tồn tại');
select has_column('public', 'tour_profiles', 'event_staff', 'tour_profiles.event_staff tồn tại');
select has_column('public', 'tour_profiles', 'delete_request', 'tour_profiles.delete_request tồn tại');

-- ── next_tour_code: prefix theo category mới ──
select ok(public.next_tour_code('incentive_domestic') like 'NĐ.%', 'incentive nội địa → NĐ');
select ok(public.next_tour_code('incentive_intl')     like 'NN.%', 'incentive nước ngoài → NN');
select ok(public.next_tour_code('visa')               like 'VS.%', 'visa → VS');
select ok(public.next_tour_code('event')              like 'EV.%', 'event → EV');
select ok(public.next_tour_code('other')              like 'DV.%', 'dịch vụ khác → DV');

-- ── Tương thích ngược: kind cũ vẫn ra NĐ/NN ──
select ok(public.next_tour_code('domestic') like 'NĐ.%', 'kind domestic (cũ) → NĐ');
select ok(public.next_tour_code('intl')     like 'NN.%', 'kind intl (cũ) → NN');

-- ── STT tăng theo prefix+ngày: chèn 1 hồ sơ visa hôm nay → mã kế tiếp là VS.…02 ──
insert into public.tour_profiles (id, code, kind, category, name, created_by_username, created_by_name)
values ('tpvs1', 'VS.' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD.MM.YY') || '.01',
        'domestic', 'visa', 'Visa test', 'tester', 'Tester');
select is(
  public.next_tour_code('visa'),
  'VS.' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD.MM.YY') || '.02',
  'STT visa kế tiếp = 02');

-- event_staff mặc định mảng rỗng
select is(
  (select event_staff from public.tour_profiles where id='tpvs1'),
  '[]'::jsonb,
  'event_staff mặc định []'
);

select * from finish();
rollback;
