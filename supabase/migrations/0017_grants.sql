-- Grant DML access to the Supabase Data API roles.
-- Without this, the PostgREST layer returns "permission denied" even when RLS would allow access.
-- Access control is enforced by RLS policies (see each table's migration); these grants are a
-- prerequisite, not a bypass.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

-- Ensure future tables/sequences/routines also get the grants.
alter default privileges in schema public
  grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines  to anon, authenticated, service_role;
