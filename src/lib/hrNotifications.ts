/**
 * Nhắc hết hạn cho Nhân sự (giấy tờ NV + thẻ HDV) qua hệ notifications.
 * Tách riêng khỏi src/lib/notifications.ts để tránh đụng file đang phát triển song
 * song. Chỉ nhắc cho người có quyền xem HR (viewHR). Dedup theo mốc qua localStorage.
 */
import { sbSendNotification } from '@/lib/supabase';
import { daysUntil } from '@/lib/dateUtils';
import { hasPerm } from '@/auth/PERMISSIONS';
import { useHrStore } from '@/stores/hrStore';
import { useHrGuideStore } from '@/stores/hrGuideStore';
import type { User } from '@/types';

const HR_EXP_KEY = 'vte_hr_exp_seen';
const MILESTONES = [90, 30, 7, 0]; // ngày trước hết hạn

const fmt = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

export async function checkHrExpiry(user: User): Promise<void> {
  if (!hasPerm(user, 'viewHR')) return;
  try {
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(HR_EXP_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const set = new Set(seen);

    type Item = { key: string; title: string; message: string };
    const items: Item[] = [];

    const consider = (uid: string, iso: string | undefined, label: string, name: string) => {
      if (!iso) return;
      const d = daysUntil(iso);
      if (d == null) return;
      const milestone = MILESTONES.find((m) => d <= m && d >= -1);
      if (milestone == null) return;
      const k = `${uid}:${iso}:${milestone}`;
      if (set.has(k)) return;
      for (const m of MILESTONES) if (m >= milestone) set.add(`${uid}:${iso}:${m}`);
      const when = d < 0 ? 'ĐÃ HẾT HẠN' : `còn ${d} ngày`;
      items.push({
        key: k,
        title: d < 0 ? '🔴 Giấy tờ nhân sự đã hết hạn' : '⏰ Giấy tờ nhân sự sắp hết hạn',
        message: `${name} — ${label} ${when} (${fmt(iso)})`,
      });
    };

    for (const e of useHrStore.getState().employees) {
      if (e.status === 'resigned') continue;
      for (const doc of e.documents) consider(`emp:${e.id}:${doc.id}`, doc.expiresAt, doc.kind || 'Giấy tờ', e.fullName);
    }
    for (const g of useHrGuideStore.getState().guides) {
      if (g.status === 'blacklist') continue;
      consider(`guide:${g.id}`, g.guideCardExpires, 'Thẻ HDV', g.fullName);
    }

    for (const it of items) {
      await sbSendNotification(user.u, { type: 'task', title: it.title, message: it.message, createdBy: 'Hệ thống' });
    }
    if (items.length) {
      try { localStorage.setItem(HR_EXP_KEY, JSON.stringify([...set].slice(-500))); } catch { /* quota */ }
    }
  } catch (e) {
    console.warn('checkHrExpiry failed:', (e as Error).message);
  }
}
