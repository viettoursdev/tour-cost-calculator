-- App-level config readable by the provisioning trigger (SECURITY DEFINER).
-- Replaces the bootstrap-CEO GUC (`app.bootstrap_ceo_email`) from 0001, which
-- no-ops on managed Supabase because `ALTER DATABASE ... SET` needs superuser
-- and `db push` does not run as one. A row in this table works on any role.
create table public.app_config (
  key   text primary key,
  value text not null
);

alter table public.app_config enable row level security;

-- Company users may read config; no client write policy (service-role /
-- migrations only). The provisioning trigger is SECURITY DEFINER so it reads
-- this table regardless of RLS.
create policy app_config_company_read on public.app_config
  for select using (public.is_viettours_user());

insert into public.app_config (key, value)
  values ('bootstrap_ceo_email', 'developer@viettours.com.vn')
  on conflict (key) do nothing;

-- Re-point the trigger function at app_config. Body is otherwise identical to
-- 0001 (same insert columns, same on conflict do nothing, same search_path).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ceo_email text := (select value from public.app_config where key = 'bootstrap_ceo_email');
begin
  insert into public.profiles (id, email, username, name, role)
  values (
    new.id,
    new.email,
    split_part(new.email, '@', 1),
    split_part(new.email, '@', 1),
    case when new.email = ceo_email then 'CEO' else 'Standard' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
