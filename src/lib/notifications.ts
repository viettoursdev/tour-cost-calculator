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
import { useCustomerStore } from '@/stores/customerStore';
import { useAuthStore } from '@/stores/authStore';
import { ROLE_RANK } from '@/auth/ROLES';
import { daysUntil } from '@/lib/dateUtils';
import type { User } from '@/types';

/** Số ngày quá hạn để tự báo lên quản lý (Trưởng Phòng trở lên). */
const WF_ESCALATE_AFTER = 3;

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
    // Escalation: quản lý (Trưởng Phòng trở lên) được báo các bước quá hạn LÂU của
    // người khác — để đốc thúc. Mỗi (báo giá, bước, hạn) escalate 1 lần.
    if (ROLE_RANK[user.role] >= ROLE_RANK['Trưởng Phòng']) {
      const nameOf = (u?: string) => useAuthStore.getState().users.find((x) => x.u === u)?.name ?? u ?? '';
      for (const q of quotes) {
        for (const w of q.workflowDue ?? []) {
          const d = daysUntil(w.dueDate);
          if (d == null || d >= -WF_ESCALATE_AFTER) continue; // chỉ quá hạn > N ngày
          const owner = w.assignee || q.createdByUsername;
          if (owner === user.u) continue; // việc của chính mình đã nhắc ở trên
          const key = `esc:${q.cloudId}:${w.label}:${w.dueDate}`;
          if (set.has(key)) continue;
          set.add(key);
          await fbSendNotification(user.u, {
            type: 'task',
            title: '🚩 Bước quy trình quá hạn lâu — cần đốc thúc',
            message: `Báo giá "${q.name}" — ${w.label}: QUÁ HẠN ${Math.abs(d)} ngày · phụ trách ${nameOf(owner)}`,
            createdBy: 'Hệ thống',
            data: { cloudId: q.cloudId },
          });
        }
      }
    }
    try { localStorage.setItem(WF_DDL_KEY, JSON.stringify([...set].slice(-500))); } catch { /* ignore */ }
  } catch (e) {
    console.warn('checkWorkflowDeadlines failed:', (e as Error).message);
  }
}

const SALES_KEY = 'vte_sales_followup_notified';
/** Số ngày KHÔNG cập nhật trước khi nhắc follow-up, theo trạng thái deal. */
const FOLLOWUP_DAYS: Partial<Record<string, number>> = { sent: 4, negotiating: 3 };

/**
 * Nhắc follow-up bán hàng: báo giá ở trạng thái "Đã gửi"/"Đang deal" mà quá N ngày
 * KHÔNG cập nhật → nhắc người tạo liên hệ khách. Quét index lịch sử (đã subscribe).
 * Dedup theo (báo giá, trạng thái, NGÀY) — tối đa 1 lần/ngày cho mỗi deal nguội.
 */
export async function checkSalesFollowups(user: User): Promise<void> {
  try {
    const quotes = useQuoteHistoryStore.getState().quotes;
    const today = new Date().toISOString().slice(0, 10);
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(SALES_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const set = new Set(seen);
    for (const q of quotes) {
      const threshold = q.status ? FOLLOWUP_DAYS[q.status] : undefined;
      if (threshold == null) continue;                 // chỉ sent/negotiating
      if (q.createdByUsername !== user.u) continue;     // deal của chính mình
      const since = q.updatedAt ? Math.floor((Date.now() - Date.parse(q.updatedAt)) / 86400000) : null;
      if (since == null || since < threshold) continue;
      const key = `${q.cloudId}:${q.status}:${today}`;
      if (set.has(key)) continue;
      set.add(key);
      await fbSendNotification(user.u, {
        type: 'task',
        title: '📞 Cần follow-up báo giá',
        message: `"${q.name}" (${q.status === 'sent' ? 'đã gửi khách' : 'đang deal'}) — ${since} ngày chưa cập nhật. Liên hệ ${q.customerName || 'khách'} để chốt.`,
        createdBy: 'Hệ thống',
        data: { cloudId: q.cloudId },
      });
    }
    try { localStorage.setItem(SALES_KEY, JSON.stringify([...set].slice(-500))); } catch { /* ignore */ }
  } catch (e) {
    console.warn('checkSalesFollowups failed:', (e as Error).message);
  }
}

const CUST_FU_KEY = 'vte_customer_followup_notified';
/**
 * Nhắc lịch hẹn liên hệ lại khách (next action) tới hạn/quá hạn cho người đã đặt.
 * Quét customerStore; dedup theo (khách, ngày hẹn, NGÀY hôm nay).
 */
export async function checkCustomerFollowups(user: User): Promise<void> {
  try {
    const customers = useCustomerStore.getState().customers;
    const today = new Date().toISOString().slice(0, 10);
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(CUST_FU_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const set = new Set(seen);
    for (const c of customers) {
      const fu = c.nextFollowUp;
      if (!fu || fu.byU !== user.u) continue;     // hẹn của chính mình
      if (fu.date > today) continue;              // chưa tới hạn
      const key = `${c.id}:${fu.date}:${today}`;
      if (set.has(key)) continue;
      set.add(key);
      const overdueDays = Math.floor((Date.parse(today) - Date.parse(fu.date)) / 86400000);
      await fbSendNotification(user.u, {
        type: 'task',
        title: '📅 Hẹn liên hệ lại khách hàng',
        message: `${c.name} — ${overdueDays > 0 ? `QUÁ HẠN ${overdueDays} ngày` : 'đến hẹn hôm nay'}${fu.note ? `: ${fu.note}` : ''}`,
        createdBy: 'Hệ thống',
      });
    }
    try { localStorage.setItem(CUST_FU_KEY, JSON.stringify([...set].slice(-500))); } catch { /* ignore */ }
  } catch (e) {
    console.warn('checkCustomerFollowups failed:', (e as Error).message);
  }
}

const DORMANT_KEY = 'vte_dormant_notified';
const DORMANT_MONTHS = 6;   // chưa đi tour mới quá 6 tháng
const RECENT_CONTACT_MONTHS = 3; // đã chăm sóc trong 3 tháng → bỏ qua
const monthsAgoISO = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d.toISOString().slice(0, 10); };

/**
 * Nhắc chăm sóc khách "ngủ": đã từng đi tour nhưng chưa quay lại quá N tháng và
 * không được chăm sóc gần đây. Gửi 1 thông báo TÓM TẮT/tháng cho mỗi sale (khách
 * do mình tạo) để tránh spam.
 */
export async function checkDormantCustomers(user: User): Promise<void> {
  try {
    const customers = useCustomerStore.getState().customers.filter((c) => c.createdBy === user.name);
    if (!customers.length) return;
    const quotes = useQuoteHistoryStore.getState().quotes;
    const today = new Date().toISOString().slice(0, 10);
    const dormantCut = monthsAgoISO(DORMANT_MONTHS);
    const contactCut = monthsAgoISO(RECENT_CONTACT_MONTHS);
    let count = 0;
    for (const c of customers) {
      const theirs = quotes.filter((q) => (q.customerId ? q.customerId === c.id : q.customerName === c.name) && q.departDate);
      if (!theirs.length) continue;                                   // chưa từng có tour
      const departs = theirs.map((q) => q.departDate as string).sort();
      const lastDepart = departs[departs.length - 1];
      if (lastDepart >= dormantCut || lastDepart >= today) continue;  // còn hoạt động / sắp đi
      const contacts = (c.interactions ?? []).map((i) => i.at.slice(0, 10)).sort();
      const lastContact = contacts[contacts.length - 1];
      if (lastContact && lastContact >= contactCut) continue;         // vừa chăm sóc
      if (c.nextFollowUp) continue;                                   // đã có lịch hẹn
      count++;
    }
    if (!count) return;
    const monthKey = `dormant:${user.u}:${today.slice(0, 7)}`;
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(DORMANT_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    if (seen.includes(monthKey)) return;
    seen.push(monthKey);
    await fbSendNotification(user.u, {
      type: 'task',
      title: '💤 Khách hàng cần chăm sóc lại',
      message: `Bạn có ${count} khách đã hơn ${DORMANT_MONTHS} tháng chưa quay lại. Vào tab Khách hàng để mời tour mới / chăm sóc.`,
      createdBy: 'Hệ thống',
    });
    try { localStorage.setItem(DORMANT_KEY, JSON.stringify(seen.slice(-100))); } catch { /* ignore */ }
  } catch (e) {
    console.warn('checkDormantCustomers failed:', (e as Error).message);
  }
}
