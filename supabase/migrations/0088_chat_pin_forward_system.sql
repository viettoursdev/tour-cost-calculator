-- Ghim tin, tin hệ thống (sự kiện nhóm), và chuyển tiếp.
alter table public.chat_messages
  add column if not exists pinned        boolean not null default false,
  add column if not exists is_system     boolean not null default false,
  add column if not exists forwarded_from text;

-- Lọc nhanh các tin đã ghim trong một cuộc.
create index if not exists chat_messages_pinned_idx
  on public.chat_messages(chat_id) where pinned;
