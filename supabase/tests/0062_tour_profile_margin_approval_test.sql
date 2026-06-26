-- 0062 — Chốt duyệt biên lợi thấp: cột margin_approval jsonb (nullable).
begin;
select plan(2);

select has_column('public', 'tour_profiles', 'margin_approval', 'tour_profiles.margin_approval tồn tại');

insert into public.tour_profiles (id, code, kind, category, name, created_by_username, created_by_name)
values ('tpma1', 'NĐ.26.06.26.93', 'domestic', 'incentive_domestic', 'Margin test', 'tester', 'Tester');
select ok(
  (select margin_approval is null from public.tour_profiles where id = 'tpma1'),
  'margin_approval mặc định NULL'
);

select * from finish();
rollback;
