-- Liệt kê Việc / Báo giá gần đây + id, để chọn targetId khi gắn email (connector).
-- Chạy: psql "$SUPABASE_DB_URL" -f scripts/list-targets.sql

\echo '== TODOS (15 gần nhất) — dùng cột id làm targetId =='
select id, status, left(title, 60) as title
from public.todos
order by coalesce(updated_at, created_at) desc nulls last
limit 15;

\echo ''
\echo '== QUOTES (15 gần nhất) — dùng cột cloud_id làm targetId =='
select cloud_id, template, status, left(name, 60) as name
from public.quotes
order by coalesce(updated_at, created_at) desc nulls last
limit 15;
