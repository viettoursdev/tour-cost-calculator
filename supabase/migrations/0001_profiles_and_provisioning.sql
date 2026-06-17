-- Canonical user profile, 1:1 with auth.users.
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique,
  email      text,
  role       text not null default 'Standard'
             check (role in ('CEO','Ban Giám Đốc','Trưởng Phòng','Sales',
                             'Operations','Marketing','Admin','Accountant','Standard')),
  name       text not null default '',
  color      text not null default '#888888',
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_company_read  on public.profiles for select using (public.is_viettours_user());
create policy profiles_company_write on public.profiles for all
  using (public.is_viettours_user()) with check (public.is_viettours_user());

-- Bootstrap CEO email (read by the trigger; not hardcoded in policies).
-- Requires superuser; falls back gracefully if running as a non-superuser role.
-- In production: apply manually as a superuser or via Supabase dashboard.
do $$
begin
  execute 'alter database postgres set "app.bootstrap_ceo_email" = ''developer@viettours.com.vn''';
exception
  when insufficient_privilege then
    raise notice 'app.bootstrap_ceo_email not set (insufficient privilege — expected on local non-superuser dev; set by supabase_admin in cloud)';
end;
$$;

-- First-login provisioning: create a default profile for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ceo_email text := current_setting('app.bootstrap_ceo_email', true);
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
