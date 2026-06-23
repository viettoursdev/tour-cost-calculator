-- Gắn email (connector) vào email_links — chạy trong CI bằng SUPABASE_DB_URL (bypass RLS).
-- Truyền mảng EmailLink (JSON) qua biến psql :links, vd:
--   psql "$SUPABASE_DB_URL" -v links="$(cat links.json)" -f scripts/link-email-upsert.sql
-- Dedup theo (emailId, targetType, targetId); link mới được ĐƯA LÊN ĐẦU mảng.

with incoming as (
  select :'links'::jsonb as nl
),
cur as (
  select coalesce(links, '[]'::jsonb) as el
  from public.email_links
  where one_row = true
),
to_add as (
  select coalesce(jsonb_agg(e), '[]'::jsonb) as a
  from incoming i
  cross join lateral jsonb_array_elements(i.nl) e
  where not exists (
    select 1
    from cur
    cross join lateral jsonb_array_elements(cur.el) x
    where x->>'emailId'    = e->>'emailId'
      and x->>'targetType' = e->>'targetType'
      and x->>'targetId'   = e->>'targetId'
  )
)
insert into public.email_links (one_row, links, updated_at, updated_by)
select
  true,
  (select a from to_add) || coalesce((select el from cur), '[]'::jsonb),
  now(),
  'Claude (connector)'
on conflict (one_row) do update
  set links      = excluded.links,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

-- Báo số lượng sau khi ghi.
select jsonb_array_length(links) as total_links from public.email_links where one_row = true;
