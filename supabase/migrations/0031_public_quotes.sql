-- Báo giá chia sẻ công khai cho khách (mirrors Firestore public_quotes/{token}).
-- DELIBERATE divergence: anon read + anon "accept once". Everything else is company-only.
create table public.public_quotes (
  token               text primary key,
  payload             jsonb not null,                 -- PublicQuoteDoc minus acceptance
  acceptance          jsonb,                          -- set once by the customer
  created_by          uuid references public.profiles(id),
  created_by_username text,
  created_at          timestamptz not null default now()
);

-- Share marker ({token, publishedAt}) on the quote-history row, set independently
-- of save_quote_state (so re-saving a quote never clobbers it).
alter table public.quotes add column share jsonb;

alter table public.public_quotes enable row level security;

-- Anyone (incl. unauthenticated customers) may read a shared quote by token.
create policy public_quotes_read on public.public_quotes for select using (true);
-- Only company users publish / edit / unpublish.
create policy public_quotes_write on public.public_quotes for all
  using (public.is_viettours_user()) with check (public.is_viettours_user());

-- Anonymous "accept once": SECURITY DEFINER so anon writes ONLY acceptance, and
-- ONLY while it is still null. Mirrors the Firestore update rule
-- (hasOnly(['acceptance']) && !('acceptance' in resource.data)).
create or replace function public.accept_public_quote(p_token text, p_acceptance jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.public_quotes
     set acceptance = p_acceptance
   where token = p_token and acceptance is null;
$$;

-- 0017 grants cover only authenticated/service_role; grant anon explicitly.
grant select on public.public_quotes to anon;
grant execute on function public.accept_public_quote(text, jsonb) to anon;
