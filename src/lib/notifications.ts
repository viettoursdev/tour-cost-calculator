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
