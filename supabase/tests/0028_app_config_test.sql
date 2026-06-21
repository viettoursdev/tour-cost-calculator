begin;
select plan(4);

select has_table('public', 'app_config', 'app_config table exists');
select is(
  (select value from public.app_config where key = 'bootstrap_ceo_email'),
  'developer@viettours.com.vn', 'bootstrap_ceo_email seeded');

-- NO set_config here — the trigger must read the seed from app_config.
-- This is the regression guard for the cloud GUC no-op.
insert into auth.users (id, email, instance_id, aud, role)
values (gen_random_uuid(), 'someone@viettours.com.vn', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
select is(
  (select role from public.profiles where email = 'someone@viettours.com.vn'),
  'Standard', 'non-bootstrap user gets Standard without any GUC');

insert into auth.users (id, email, instance_id, aud, role)
values (gen_random_uuid(), 'developer@viettours.com.vn', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
select is(
  (select role from public.profiles where email = 'developer@viettours.com.vn'),
  'CEO', 'bootstrap email gets CEO from app_config (no GUC)');

select * from finish();
rollback;
