export async function requestBrowserNotifPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function showBrowserNotif(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch {
    /* ignore — browser/OS may suppress */
  }
}

import { fbGetContracts, fbSendNotification } from '@/lib/firebase';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { daysUntil } from '@/lib/dateUtils';
import type { User } from '@/types';

/**
 * Check contracts for payments due within 7 days and send reminder notifications.
 * Called with a 3-second delay after login.
 * Source: legacy checkContractDeadlines (legacy.html:10561).
 */
export async function checkContractDeadlines(user: User): Promise<void> {
  try {
    const contracts = await fbGetContracts();
    const today = new Date();
    const in7days = new Date(today.getTime() + 7 * 86400000);
    for (const c of contracts) {
      for (const p of c.payments ?? []) {
        if (p.status !== 'pending' || !p.dueDate) continue;
        // dueDate is stored as "DD/MM/YYYY" string in legacy; try both formats
        const parts = p.dueDate.includes('/')
          ? p.dueDate.split('/').reverse().join('-')  // "DD/MM/YYYY" → "YYYY-MM-DD"
          : p.dueDate;
        const due = new Date(parts);
        if (isNaN(due.getTime())) continue;
        if (due <= in7days && due >= today) {
          const daysLeft = Math.ceil((due.getTime() - today.getTime()) / 86400000);
          await fbSendNotification(user.u, {
            type: 'payment_due',
            title: '⏰ Sắp đến hạn thanh toán',
            message: `HĐ #${c.contractNo || c.id} - "${p.label}": ${(+p.amount || 0).toLocaleString('vi-VN')} đ - còn ${daysLeft} ngày`,
            createdBy: 'Hệ thống',
            data: { contractId: c.id, paymentId: p.id },
          });
        }
      }
    }
  } catch (e) {
    console.warn('checkContractDeadlines failed:', (e as Error).message);
  }
}

const VISA_DDL_KEY = 'vte_visa_deadline_notified';

/**
 * Nhắc các mốc hồ sơ visa sắp đến hạn (trong 7 ngày, chưa hoàn tất) cho nhân sự
 * phụ trách. Mỗi (dự án, mốc, ngày) chỉ nhắc một lần (dedup qua localStorage).
 * Gọi sau khi đăng nhập + dữ liệu dự án đã tải.
 */
export async function checkVisaDeadlines(user: User): Promise<void> {
  try {
    const projects = useVisaProjectStore.getState().projects;
    const mine = projects.filter((p) =>
      p.createdByUsername === user.u
      || (p.mainStaff ?? []).includes(user.u)
      || (p.supportStaff ?? []).includes(user.u));
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(VISA_DDL_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const set = new Set(seen);
    for (const p of mine) {
      for (const m of p.milestones ?? []) {
        if (m.done || !m.date) continue;
        const d = daysUntil(m.date);
        if (d == null || d < 0 || d > 7) continue;
        const key = `${p.id}:${m.id}:${m.date}`;
        if (set.has(key)) continue;
        set.add(key);
        await fbSendNotification(user.u, {
          type: 'task',
          title: '⏰ Sắp đến hạn hồ sơ visa',
          message: `Dự án "${p.name || p.code}" — ${m.label}: còn ${d} ngày (${new Date(m.date).toLocaleDateString('vi-VN')})`,
          createdBy: 'Hệ thống',
          data: { visaProjectId: p.id, milestoneId: m.id },
        });
      }
    }
    try { localStorage.setItem(VISA_DDL_KEY, JSON.stringify([...set].slice(-500))); } catch { /* ignore */ }
  } catch (e) {
    console.warn('checkVisaDeadlines failed:', (e as Error).message);
  }
}

const WF_DDL_KEY = 'vte_workflow_deadline_notified';

/**
 * Nhắc các bước quy trình vận hành sắp/đã quá hạn cho người phụ trách (hoặc người
 * tạo nếu bước không gán). Quét tóm tắt `workflowDue` trong index lịch sử báo giá
 * (đã subscribe) → không cần mở từng báo giá. Mỗi (báo giá, bước, hạn) nhắc 1 lần.
 */
export async function checkWorkflowDeadlines(user: User): Promise<void> {
  try {
    const quotes = useQuoteHistoryStore.getState().quotes;
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(WF_DDL_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const set = new Set(seen);
    for (const q of quotes) {
      for (const w of q.workflowDue ?? []) {
        const target = w.assignee || q.createdByUsername;
        if (target !== user.u) continue;
        const d = daysUntil(w.dueDate);
        if (d == null || d > 7) continue; // gồm cả quá hạn (d < 0)
        const key = `${q.cloudId}:${w.label}:${w.dueDate}`;
        if (set.has(key)) continue;
        set.add(key);
        const when = d < 0 ? `QUÁ HẠN ${Math.abs(d)} ngày` : d === 0 ? 'hôm nay' : `còn ${d} ngày`;
        await fbSendNotification(user.u, {
          type: 'task',
          title: d < 0 ? '🔴 Bước quy trình quá hạn' : '⏰ Bước quy trình sắp đến hạn',
          message: `Báo giá "${q.name}" — ${w.label}: ${when} (${new Date(w.dueDate).toLocaleDateString('vi-VN')})`,
          createdBy: 'Hệ thống',
          data: { cloudId: q.cloudId },
        });
      }
    }
    try { localStorage.setItem(WF_DDL_KEY, JSON.stringify([...set].slice(-500))); } catch { /* ignore */ }
  } catch (e) {
    console.warn('checkWorkflowDeadlines failed:', (e as Error).message);
  }
}
