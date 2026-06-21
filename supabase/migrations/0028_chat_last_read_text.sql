-- Change chat_members.last_read from timestamptz to text so the app's ISO strings
-- round-trip without timezone-format normalization (PostgREST returns '+00:00' for
-- timestamptz, but the app always wraps the value in new Date(...).toISOString()).
alter table public.chat_members
  alter column last_read type text using to_char(last_read at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
