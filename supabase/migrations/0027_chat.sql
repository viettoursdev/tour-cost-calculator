-- Chat schema: chats, chat_members, chat_messages
-- Mirrors Firestore chats/{id} collection.
-- chats.id is text to preserve app-generated keys ('dm_{a}__{b}' for DMs, uuid for groups).

create table public.chats (
  id             text primary key,          -- 'dm_{a}__{b}' or uuid
  is_group       boolean not null default false,
  title          text,
  created_by     uuid references public.profiles(id),
  created_by_name text,
  created_at     timestamptz not null default now(),
  last_at        timestamptz,
  last_text      text,
  last_by_name   text
);

create table public.chat_members (
  chat_id   text not null references public.chats(id) on delete cascade,
  user_id   uuid references public.profiles(id),
  username  text not null,
  last_read timestamptz,
  primary key (chat_id, username)
);

create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  chat_id     text not null references public.chats(id) on delete cascade,
  legacy_id   text,                                  -- ChatMessage.id (client-generated)
  by_user_id  uuid references public.profiles(id),
  by_username text not null,
  by_name     text not null default '',
  at          timestamptz not null default now(),
  text        text,
  file        jsonb,                                 -- ChatFile: {key,name,size,mime?}
  reply_to    jsonb,                                 -- ChatReply: {id,byName,text}
  edited_at   timestamptz,
  deleted     boolean not null default false,
  reactions   jsonb not null default '{}'::jsonb,    -- emoji → username[]
  sort_order  bigint generated always as identity    -- stable ordering
);

create index chat_messages_chat_idx on public.chat_messages(chat_id);
create index chat_messages_at_idx   on public.chat_messages(at);

do $$
declare t text;
begin
  foreach t in array array['chats','chat_members','chat_messages'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I on public.%I for select using (public.is_viettours_user());', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_viettours_user()) with check (public.is_viettours_user());', t||'_write', t);
  end loop;
end $$;

alter publication supabase_realtime add table
  public.chats,
  public.chat_members,
  public.chat_messages;
