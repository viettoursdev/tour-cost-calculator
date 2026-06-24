-- Suppliers (NCC): persist the full modal payload.
-- The NCCModal collects continent/country/address/website/tax code/status,
-- bank & payment terms, attached files, served tours, AI analysis, ratings,
-- creator username and collaborators — but the table only had
-- name/sectors/location/note. Those fields were silently dropped on save.
-- RLS already applies row-wide (is_viettours_user), so new columns need no
-- extra policies.

alter table public.suppliers
  add column if not exists continent     text,
  add column if not exists country        text,
  add column if not exists address        text,
  add column if not exists website        text,
  add column if not exists tax_code       text,
  add column if not exists status         text,
  add column if not exists bank           jsonb,
  add column if not exists payment_terms  text,
  add column if not exists commission     text,
  add column if not exists credit_limit   double precision,
  add column if not exists files          jsonb  not null default '[]'::jsonb,
  add column if not exists tours          text[] not null default '{}',
  add column if not exists ai_analysis    text,
  add column if not exists ratings        jsonb  not null default '[]'::jsonb,
  add column if not exists created_by_u   text,
  add column if not exists collaborators  jsonb  not null default '[]'::jsonb;
