-- Toàn vẹn tham chiếu: khoá ngoại cho liên kết "thực thể → hồ sơ tour".
--  Bổ sung tầng DB cho việc dọn mồ côi đã làm ở app (onQuoteDeleted): khi xoá một
--  hồ sơ tour, mọi tham chiếu tour_profile_id tự về NULL (ON DELETE SET NULL).
--
--  CHỦ Ý: KHÔNG thêm FK cho tour_profiles.primary_quote_id. Lúc tạo báo giá, hồ sơ
--  (mang primary_quote_id = cloudId) được upsert TRƯỚC khi dòng quote tồn tại
--  (xem quoteStore.saveCloud) → FK sẽ vi phạm. Orphan của primary_quote_id đã được
--  xử lý ở tầng app (tourProfileStore.onQuoteDeleted).

-- 1) Dọn tham chiếu treo TRƯỚC khi thêm FK (an toàn nếu có dữ liệu lệch).
update public.quotes        set tour_profile_id = null where tour_profile_id is not null and not exists (select 1 from public.tour_profiles tp where tp.id = quotes.tour_profile_id);
update public.contracts     set tour_profile_id = null where tour_profile_id is not null and not exists (select 1 from public.tour_profiles tp where tp.id = contracts.tour_profile_id);
update public.visa_projects set tour_profile_id = null where tour_profile_id is not null and not exists (select 1 from public.tour_profiles tp where tp.id = visa_projects.tour_profile_id);
update public.itineraries   set tour_profile_id = null where tour_profile_id is not null and not exists (select 1 from public.tour_profiles tp where tp.id = itineraries.tour_profile_id);
update public.menus         set tour_profile_id = null where tour_profile_id is not null and not exists (select 1 from public.tour_profiles tp where tp.id = menus.tour_profile_id);

-- 2) Thêm FK ON DELETE SET NULL (guard idempotent qua pg_constraint).
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('quotes',        'quotes_tour_profile_fk'),
      ('contracts',     'contracts_tour_profile_fk'),
      ('visa_projects', 'visa_projects_tour_profile_fk'),
      ('itineraries',   'itineraries_tour_profile_fk'),
      ('menus',         'menus_tour_profile_fk')
    ) as v(tbl, conname)
  loop
    if not exists (select 1 from pg_constraint where conname = t.conname) then
      execute format(
        'alter table public.%I add constraint %I foreign key (tour_profile_id) references public.tour_profiles(id) on delete set null',
        t.tbl, t.conname
      );
    end if;
  end loop;
end $$;
