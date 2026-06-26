-- 0061 — Nhãn tự do: cột tags text[], mặc định '{}'.
begin;
select plan(2);

select has_column('public', 'tour_profiles', 'tags', 'tour_profiles.tags tồn tại');

insert into public.tour_profiles (id, code, kind, category, name, created_by_username, created_by_name)
values ('tptag1', 'NĐ.26.06.26.92', 'domestic', 'incentive_domestic', 'Tag test', 'tester', 'Tester');
select is(
  (select tags from public.tour_profiles where id = 'tptag1'),
  '{}'::text[],
  'tags mặc định {}'
);

select * from finish();
rollback;
