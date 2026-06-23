#!/usr/bin/env node
/**
 * Cầu nối "Connector Outlook (Claude) → email_links": ghi các email tìm được qua
 * connector vào bảng `email_links` của app, gắn vào một target (todo/customer/quote).
 *
 * KHÔNG dùng Azure App — Claude chạy script này bằng service-role key của Supabase.
 *
 * Dùng:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/link-email.mjs payload.json [--dry-run]
 *   node scripts/link-email.mjs payload.json --emit links.json   # chỉ dựng mảng link (cho CI/psql)
 *
 * payload.json:
 * {
 *   "target":  { "type": "todo" | "customer" | "quote", "id": "<id>", "name": "..." },
 *   "linkedBy": "Claude (connector)",
 *   "emails": [
 *     { "emailId": "<graph id>", "subject": "...", "fromName": "...", "fromAddress": "...",
 *       "toAddress": "a@x, b@y", "receivedAt": "ISO", "webLink": "https://outlook...",
 *       "direction": "in" }
 *   ]
 * }
 *
 * Env:
 *   SUPABASE_SERVICE_ROLE_KEY  (bắt buộc — KHÔNG commit, đặt ở .env.local / biến môi trường)
 *   SUPABASE_URL               (tuỳ chọn — mặc định suy ra từ project ref)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
// @supabase/supabase-js được import ĐỘNG (chỉ khi ghi bằng service-role key) →
// chế độ --emit (cho CI/psql) chạy bằng node builtins, không cần cài deps.

const PROJECT_REF = 'zkzrvctqwnhzklvsoahk';
const URL = process.env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const emitIdx = args.indexOf('--emit');
const emitPath = emitIdx >= 0 ? args[emitIdx + 1] : null; // chế độ CI: chỉ dựng mảng link, dedup do SQL lo
const positional = args.filter((a, i) => !a.startsWith('--') && i !== emitIdx + 1);
const payloadPath = positional[0];

function die(msg) { console.error('❌ ' + msg); process.exit(1); }

if (!payloadPath) die('Thiếu đường dẫn payload.json. Xem header file để biết định dạng.');
if (!KEY && !dryRun && !emitPath) die('Thiếu SUPABASE_SERVICE_ROLE_KEY (đặt qua biến môi trường, đừng dán vào chat).');

const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
const { target, emails, linkedBy = 'Claude (connector)' } = payload;

if (!target?.type || !target?.id) die('payload.target cần { type, id }.');
if (!['todo', 'customer', 'quote'].includes(target.type)) die(`target.type không hợp lệ: ${target.type}`);
if (!Array.isArray(emails) || emails.length === 0) die('payload.emails rỗng.');

const now = new Date().toISOString();

const toLink = (e) => ({
  id: 'eml' + randomUUID().slice(0, 12),
  emailId: e.emailId,
  subject: e.subject ?? '(không tiêu đề)',
  fromName: e.fromName ?? '',
  fromAddress: e.fromAddress ?? '',
  toAddress: e.toAddress,
  receivedAt: e.receivedAt ?? now,
  webLink: e.webLink,
  direction: e.direction ?? 'in',
  targetType: target.type,
  targetId: target.id,
  targetName: target.name,
  linkedBy,
  linkedAt: now,
});

async function main() {
  // Chế độ CI: chỉ dựng mảng EmailLink đầy đủ (id/linkedAt…) ra file; dedup + ghi do psql lo.
  if (emitPath) {
    const links = emails.map(toLink);
    writeFileSync(emitPath, JSON.stringify(links));
    console.log(`Emit ${links.length} link → ${emitPath} (target ${target.type} ${target.id}).`);
    links.forEach((l) => console.log(`  • ${l.subject}  ←  ${l.fromAddress}`));
    return;
  }

  let client = null;
  if (KEY) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(URL, KEY, { auth: { persistSession: false } });
  }

  let existing = [];
  if (client) {
    const { data, error } = await client.from('email_links').select('links').eq('one_row', true).maybeSingle();
    if (error) die('Đọc email_links lỗi: ' + error.message);
    existing = (data?.links ?? []);
  }

  const has = (e) => existing.some((l) => l.emailId === e.emailId && l.targetType === target.type && l.targetId === target.id);
  const fresh = emails.filter((e) => !has(e));
  const skipped = emails.length - fresh.length;
  const newLinks = fresh.map(toLink);
  const next = [...newLinks, ...existing];

  console.log(`Target: ${target.type} ${target.id}${target.name ? ` (${target.name})` : ''}`);
  console.log(`Email: ${emails.length} → thêm ${newLinks.length}, bỏ qua ${skipped} (đã gắn).`);
  newLinks.forEach((l) => console.log(`  + ${l.subject}  ←  ${l.fromAddress}`));

  if (dryRun) { console.log('— DRY RUN, không ghi DB.'); return; }
  if (newLinks.length === 0) { console.log('Không có gì để ghi.'); return; }

  const { error } = await client.from('email_links').upsert(
    { one_row: true, links: next, updated_at: now, updated_by: linkedBy },
    { onConflict: 'one_row' },
  );
  if (error) die('Ghi email_links lỗi: ' + error.message);
  console.log(`✅ Đã ghi ${newLinks.length} link vào email_links (tổng ${next.length}).`);
}

main().catch((e) => die(String(e)));
