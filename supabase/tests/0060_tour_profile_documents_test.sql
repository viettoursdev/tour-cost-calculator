-- 0060 — Trung tâm tài liệu cấp hồ sơ: cột documents jsonb, mặc định [].
begin;
select plan(2);

select has_column('public', 'tour_profiles', 'documents', 'tour_profiles.documents tồn tại');

insert into public.tour_profiles (id, code, kind, category, name, created_by_username, created_by_name)
values ('tpdoc1', 'NĐ.26.06.26.91', 'domestic', 'incentive_domestic', 'Doc test', 'tester', 'Tester');
select is(
  (select documents from public.tour_profiles where id = 'tpdoc1'),
  '[]'::jsonb,
  'documents mặc định []'
);

select * from finish();
rollback;
