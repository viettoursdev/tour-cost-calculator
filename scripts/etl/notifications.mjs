// scripts/etl/notifications.mjs — notifications, threads (+members/comments), chats (+members/messages).
import { insert } from './db.mjs';
import { iso } from './util.mjs';

export async function loadNotifications(client, dump, r) {
  const docs = dump.collections.user_notifications ?? {};
  const rows = [];
  for (const [ownerUsername, doc] of Object.entries(docs)) {
    const ownerId = r.resolve(ownerUsername);
    if (!ownerId) continue;  // notifications table requires a non-null owner (NOT NULL user_id)
    for (const n of doc.notifications ?? []) {
      rows.push({
        legacy_id: n.id ?? null, user_id: ownerId, type: n.type, title: n.title ?? '', message: n.message ?? '',
        created_by: r.resolve(n.createdBy), created_by_name: n.createdByName ?? null,
        created_at: iso(n.createdAt) ?? undefined, read: n.read ?? false, link: n.link ?? null,
        thread_id: n.threadId ?? null, data: n.data ?? null, priority: n.priority ?? null, reminder: n.reminder ?? null,
      });
    }
  }
  await insert(client, 'notifications', rows);
}

export async function loadThreads(client, dump, r) {
  const docs = dump.collections.notification_threads ?? {};
  const threadRows = Object.values(docs).map((x) => ({
    id: x.id, title: x.title ?? '', link: x.link ?? null, act_type: x.actType ?? null, status: x.status ?? null,
    created_by: r.resolve(x.createdBy), created_by_name: x.createdByName ?? null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt), updated_by_name: x.updatedByName ?? null,
    data: x.data ?? null,
  }));
  await insert(client, 'notification_threads', threadRows);
  const members = [], comments = [];
  for (const x of Object.values(docs)) {
    (x.members ?? []).forEach((u) => members.push({ thread_id: x.id, user_id: r.resolve(u), username: u }));
    (x.comments ?? []).forEach((cm, i) => comments.push({
      thread_id: x.id, legacy_id: cm.id ?? null, by_user_id: r.resolve(cm.by), by_username: cm.by ?? null,
      by_name: cm.byName ?? '', text: cm.text ?? '', at: iso(cm.at) ?? undefined, sort_order: i,
    }));
  }
  await insert(client, 'notification_thread_members', members);
  await insert(client, 'notification_comments', comments);
}

export async function loadChats(client, dump, r) {
  const docs = dump.collections.chats ?? {};
  const chatRows = Object.values(docs).map((x) => ({
    id: x.id, is_group: x.isGroup ?? false, title: x.title ?? null,
    created_by: r.resolve(x.createdBy), created_by_name: x.createdByName ?? null,
    created_at: iso(x.createdAt) ?? undefined, last_at: iso(x.lastAt), last_text: x.lastText ?? null,
    last_by_name: x.lastByName ?? null,
  }));
  await insert(client, 'chats', chatRows);
  const members = [], messages = [];
  for (const x of Object.values(docs)) {
    (x.members ?? []).forEach((u) => members.push({
      chat_id: x.id, user_id: r.resolve(u), username: u, last_read: iso(x.reads?.[u]),
    }));
    (x.messages ?? []).forEach((m) => messages.push({
      chat_id: x.id, legacy_id: m.id ?? null, by_user_id: r.resolve(m.by), by_username: m.by ?? null,
      by_name: m.byName ?? '', at: iso(m.at) ?? undefined, text: m.text ?? null, file: m.file ?? null,
      reply_to: m.replyTo ?? null, edited_at: iso(m.editedAt), deleted: m.deleted ?? false,
      reactions: m.reactions ?? {},
    }));
  }
  await insert(client, 'chat_members', members);
  await insert(client, 'chat_messages', messages);
}
