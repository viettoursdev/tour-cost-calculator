-- Extensions
create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists pgtap;          -- testing

-- Reusable RLS predicate: authenticated company-domain user.
create or replace function public.is_viettours_user()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'email') ilike '%@viettours.com.vn', false);
$$;
