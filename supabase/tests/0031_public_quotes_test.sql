begin;
select plan(7);
select has_table('public', 'public_quotes', 'public_quotes table exists');
select has_column('public', 'quotes', 'share', 'quotes.share column added');
select has_function('public', 'accept_public_quote', array['text', 'jsonb'], 'accept RPC exists');
select has_function('public', 'get_public_quote', array['text'], 'get_public_quote RPC exists');

insert into public.public_quotes (token, payload) values ('tok1', '{"tourName":"X"}'::jsonb);
select public.accept_public_quote('tok1', '{"name":"Khach"}'::jsonb);
select is(
  (select acceptance->>'name' from public.public_quotes where token = 'tok1'),
  'Khach', 'first accept writes acceptance');

select public.accept_public_quote('tok1', '{"name":"Khac2"}'::jsonb);
select is(
  (select acceptance->>'name' from public.public_quotes where token = 'tok1'),
  'Khach', 'second accept is a no-op (accept-once)');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.public_quotes'::regclass),
  'RLS enabled on public_quotes');
select * from finish();
rollback;
