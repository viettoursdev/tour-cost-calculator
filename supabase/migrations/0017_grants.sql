-- Grant DML access to the Supabase Data API roles (least-privilege).
-- Access control is enforced by RLS policies (see each table's migration); these grants are a
-- prerequisite, not a bypass.

-- Authenticated company users: row access is gated by RLS; this grants table-level DML.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all routines in schema public to authenticated;
-- service_role bypasses RLS (used by ETL/admin/tests).
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;
-- Future objects.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant execute on routines to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines to service_role;
