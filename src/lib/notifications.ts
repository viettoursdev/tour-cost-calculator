export async function requestBrowserNotifPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * Hiện OS notification (kể cả khi tab chạy nền). Ưu tiên service worker
 * `registration.showNotification` (bắt buộc trên Chrome Android), fallback
 * `new Notification` cho desktop. No-op nếu chưa được cấp quyền.
 */
export function showPushNotif(title: string, body: string, tag?: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body, tag, icon: `${import.meta.env.BASE_URL}favicon.ico` };
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => reg.showNotification(title, opts))
      .catch(() => {
        try { new Notification(title, opts); } catch { /* ignore */ }
      });
    return;
  }
  try {
    new Notification(title, opts);
  } catch {
    /* ignore — browser/OS may suppress */
  }
}

/** @deprecated dùng {@link showPushNotif}. Giữ alias để tương thích. */
export const showBrowserNotif = (title: string, body: string): void => showPushNotif(title, body);

import { sbGetContracts, sbSendNotification } from '@/lib/supabase';
import { sbGetPublicQuote } from '@/lib/supabase';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useTodoStore } from '@/stores/todoStore';
import { useProcessStore } from '@/stores/processStore';
import { useTourProfileStore } from '@/stores/tourProfileStore';
import { useContractStore } from '@/stores/contractStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { useAuthStore } from '@/stores/authStore';
import { ROLE_RANK, canReceivePush, isBoard } from '@/auth/ROLES';
import { escalationLevel, nudgeBucket } from '@/lib/workflowEscalate';
import { contractFlags, dealStage, effectiveStage, stageMeta, type DealStage } from '@/components/quote/dealStage';
import { tourProfileRisks } from '@/lib/tourProfile';
import { daysUntil } from '@/lib/dateUtils';
import { TRAINING_SEED } from '@/lib/trainingSeed';
import { isPhasePassed } from '@/lib/training';
import { TRAINING_PHASES, QUIZ_PASS_PCT } from '@/types';
import type { User, TrainingPhase } from '@/types';

/** Số ngày quá hạn để tự báo lên quản lý (Trưởng Phòng trở lên). */
const WF_ESCALATE_AFTER = 3;
/** Quá hạn RẤT LÂU → leo thang lên Ban Giám Đốc. */
const WF_ESCALATE_L2_AFTER = 7;
/** Nhắc LẶP người phụ trách mỗi N ngày khi vẫn còn quá hạn (thay vì chỉ 1 lần). */
const WF_RENUDGE_DAYS = 3;

/**
 * Check contracts for payments due within 7 days and send reminder notifications.
 * Called with a 3-second delay after login.
 * Source: legacy checkContractDeadlines (legacy.html:10561).
 */
export async function checkContractDeadlines(user: User): Promise<void> {
  try {
    const contracts = await sbGetContracts();
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
          const msg = `HĐ #${c.contractNo || c.id} - "${p.label}": ${(+p.amount || 0).toLocaleString('vi-VN')} đ - còn ${daysLeft} ngày`;
          await sbSendNotification(user.u, {
            type: 'payment_due',
            title: '⏰ Sắp đến hạn thanh toán',
            message: msg,
            createdBy: 'Hệ thống',
            data: { contractId: c.id, paymentId: p.id },
          });
          if (canReceivePush(user)) showPushNotif('⏰ Sắp đến hạn thanh toán', msg, `pay:${c.id}:${p.id}`);
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
        await sbSendNotification(user.u, {
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
        // Quá hạn → nhắc LẶP mỗi WF_RENUDGE_DAYS ngày (khoá đổi theo "ngăn"); sắp
        // đến hạn → chỉ 1 lần.
        const key = d < 0
          ? `${q.cloudId}:${w.label}:${w.dueDate}:n${nudgeBucket(-d, WF_RENUDGE_DAYS)}`
          : `${q.cloudId}:${w.label}:${w.dueDate}`;
        if (set.has(key)) continue;
        set.add(key);
        const when = d < 0 ? `QUÁ HẠN ${Math.abs(d)} ngày` : d === 0 ? 'hôm nay' : `còn ${d} ngày`;
        await sbSendNotification(user.u, {
          type: 'task',
          title: d < 0 ? '🔴 Bước quy trình quá hạn' : '⏰ Bước quy trình sắp đến hạn',
          message: `Báo giá "${q.name}" — ${w.label}: ${when} (${new Date(w.dueDate).toLocaleDateString('vi-VN')})`,
          createdBy: 'Hệ thống',
          data: { cloudId: q.cloudId },
        });
      }
    }
    // Escalation ĐA CẤP: quản lý được báo bước quá hạn LÂU của người khác để đốc
    // thúc. Cấp 1 (≥3 ngày) → Trưởng Phòng+; cấp 2 (≥7 ngày) → Ban Giám Đốc. Board
    // chỉ nhận cấp 2 cho bước rất-quá-hạn (tránh trùng). Nhắc lặp theo "ngăn".
    const board = isBoard(user.role);
    const isManager = ROLE_RANK[user.role] >= ROLE_RANK['Trưởng Phòng'];
    if (isManager) {
      const nameOf = (u?: string) => useAuthStore.getState().users.find((x) => x.u === u)?.name ?? u ?? '';
      for (const q of quotes) {
        for (const w of q.workflowDue ?? []) {
          const d = daysUntil(w.dueDate);
          if (d == null || d >= -WF_ESCALATE_AFTER) continue; // chỉ quá hạn > N ngày
          const owner = w.assignee || q.createdByUsername;
          if (owner === user.u) continue; // việc của chính mình đã nhắc ở trên
          const lvl = escalationLevel(-d, WF_ESCALATE_AFTER, WF_ESCALATE_L2_AFTER);
          // Board: bỏ cấp 1, chỉ nhận cấp 2. Không-board: chỉ nhận cấp 1.
          if (board && lvl < 2) continue;
          if (!board && lvl >= 2) continue;
          const bucket = nudgeBucket(-d, WF_RENUDGE_DAYS);
          const key = `esc${lvl}:${q.cloudId}:${w.label}:${w.dueDate}:n${bucket}`;
          if (set.has(key)) continue;
          set.add(key);
          await sbSendNotification(user.u, {
            type: 'task',
            title: lvl >= 2 ? '⛔ Bước quy trình quá hạn RẤT LÂU — cần BGĐ can thiệp' : '🚩 Bước quy trình quá hạn lâu — cần đốc thúc',
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

const PROC_DDL_KEY = 'vte_process_deadline_notified';

/**
 * Nhắc các bước CỦA PHIÊN CHẠY QUY TRÌNH (process_runs) sắp/đã đến hạn trong 7
 * ngày tới — gửi cho người phụ trách bước (hoặc người phụ trách phiên). Mỗi
 * (phiên, bước, hạn) chỉ nhắc 1 lần (dedup qua localStorage). Mirror checkWorkflowDeadlines.
 */
export async function checkProcessDeadlines(user: User): Promise<void> {
  try {
    const runs = useProcessStore.getState().runs;
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(PROC_DDL_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const set = new Set(seen);
    for (const r of runs) {
      if (r.status !== 'active') continue;
      for (const s of r.steps) {
        if (!s.dueDate || s.status === 'done' || s.status === 'skipped') continue;
        const target = s.assignee || r.assignee || r.createdByUsername;
        if (target !== user.u) continue;
        const d = daysUntil(s.dueDate);
        if (d == null || d > 7) continue; // gồm cả quá hạn (d < 0)
        const key = `${r.id}:${s.id}:${s.dueDate}`;
        if (set.has(key)) continue;
        set.add(key);
        const when = d < 0 ? `QUÁ HẠN ${Math.abs(d)} ngày` : d === 0 ? 'hôm nay' : `còn ${d} ngày`;
        await sbSendNotification(user.u, {
          type: 'task',
          title: d < 0 ? '🔴 Bước quy trình quá hạn' : '⏰ Bước quy trình sắp đến hạn',
          message: `Quy trình "${r.title}" — ${s.label}: ${when} (${new Date(s.dueDate).toLocaleDateString('vi-VN')})`,
          createdBy: 'Hệ thống',
        });
      }
    }
    try { localStorage.setItem(PROC_DDL_KEY, JSON.stringify([...set].slice(-500))); } catch { /* ignore */ }
  } catch (e) {
    console.warn('checkProcessDeadlines failed:', (e as Error).message);
  }
}

const TRAIN_DDL_KEY = 'vte_training_notified';
/** Mốc kết thúc dự kiến của mỗi giai đoạn 30-60-90 (số ngày từ startDate). */
const TRAINING_PHASE_DEADLINE: Record<TrainingPhase, number> = { gd0: 7, gd1: 30, gd2: 60, gd3: 90 };

/**
 * Nhắc đào tạo: (a) HỌC VIÊN — giai đoạn hiện tại sắp/đã quá mốc 30-60-90 mà chưa
 * đậu gate; (b) MENTOR — module yêu cầu ký mà học viên đã làm xong phần của mình
 * nhưng chưa được ký. Mỗi (enrollment, mốc) nhắc 1 lần (dedup localStorage).
 */
export async function checkTrainingDeadlines(user: User): Promise<void> {
  try {
    const { programs, enrollments } = useTrainingStore.getState();
    const byId = (id?: string) => programs.find((p) => p.id === id) ?? TRAINING_SEED.find((p) => p.id === id);
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(TRAIN_DDL_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const set = new Set(seen);

    for (const e of enrollments) {
      if (e.status !== 'active') continue;
      const program = byId(e.programId);
      if (!program) continue;

      // (a) Học viên: nhắc giai đoạn hiện tại nếu sắp/đã quá mốc.
      if (e.learnerUsername === user.u && e.startDate) {
        const current = TRAINING_PHASES.find((ph) => !isPhasePassed(program, e, ph.id));
        if (current) {
          const start = new Date(e.startDate);
          const deadline = new Date(start);
          deadline.setDate(deadline.getDate() + TRAINING_PHASE_DEADLINE[current.id]);
          const d = daysUntil(deadline.toISOString());
          if (d != null && d <= 7) {
            const key = `dl:${e.id}:${current.id}`;
            if (!set.has(key)) {
              set.add(key);
              const when = d < 0 ? `QUÁ HẠN ${Math.abs(d)} ngày` : d === 0 ? 'hôm nay' : `còn ${d} ngày`;
              await sbSendNotification(user.u, {
                type: 'task',
                title: d < 0 ? '🔴 Giai đoạn đào tạo quá hạn' : '⏰ Giai đoạn đào tạo sắp đến hạn',
                message: `"${program.name}" — ${current.label}: ${when}. Hoàn tất các module để qua gate.`,
                createdBy: 'Hệ thống',
              });
            }
          }
        }
      }

      // (b) Mentor: module chờ ký (học viên đã làm xong phần của mình).
      if (e.mentorUsername === user.u) {
        for (const m of program.modules) {
          if (!m.requiresMentorSignoff) continue;
          const p = e.progress[m.id];
          if (!p || p.signoffBy) continue;
          const quizOk = !m.quiz?.length || (p.quizScore ?? 0) >= QUIZ_PASS_PCT;
          const practiceOk = !m.practice?.length || !!p.practiceDone;
          const learnerActed = p.status === 'done' || p.practiceDone || p.quizScore != null;
          if (!(quizOk && practiceOk && learnerActed)) continue;
          const key = `sign:${e.id}:${m.id}`;
          if (set.has(key)) continue;
          set.add(key);
          await sbSendNotification(user.u, {
            type: 'task',
            title: '✍️ Học viên chờ bạn ký xác nhận',
            message: `${e.learnerName || e.learnerUsername} — "${program.name}" · ${m.code} ${m.title}: cần mentor ký.`,
            createdBy: 'Hệ thống',
          });
        }
      }
    }
    try { localStorage.setItem(TRAIN_DDL_KEY, JSON.stringify([...set].slice(-500))); } catch { /* ignore */ }
  } catch (e) {
    console.warn('checkTrainingDeadlines failed:', (e as Error).message);
  }
}

const QUOTE_DDL_KEY = 'vte_quote_deadline_notified';

/**
 * Nhắc deadline BÁO GIÁ: mỗi báo giá có `deadline` (chưa chốt/huỷ) → nhắc người tạo
 * & cộng tác viên khi còn ≤ 1 ngày và khi còn ≤ 6 giờ. Mỗi (báo giá, mốc, hạn) nhắc
 * 1 lần (dedup localStorage). Quét index lịch sử báo giá (đã subscribe) — chỉ áp dụng
 * cho báo giá đã LƯU cloud. Vì là check lúc đăng nhập, mốc "6 giờ" chỉ bắn nếu người
 * dùng có đăng nhập trong khoảng đó.
 */
export async function checkQuoteDeadlines(user: User): Promise<void> {
  try {
    const quotes = useQuoteHistoryStore.getState().quotes;
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(QUOTE_DDL_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const set = new Set(seen);
    const now = Date.now();
    for (const q of quotes) {
      if (!q.deadline) continue;
      // Deal đã chốt/huỷ thì không nhắc nữa.
      if (q.status === 'won' || q.status === 'not_selected' || q.status === 'cancelled') continue;
      const due = new Date(q.deadline).getTime();
      if (isNaN(due)) continue;
      const involved = new Set<string>([q.createdByUsername, ...(q.collaborators ?? []).map((c) => c.u)]);
      if (!involved.has(user.u)) continue;
      const hoursLeft = (due - now) / 3600000;
      if (hoursLeft <= 0) continue; // các mốc đều là TRƯỚC hạn
      const milestone = hoursLeft <= 6 ? '6h' : hoursLeft <= 24 ? '1d' : null;
      if (!milestone) continue;
      const key = `${q.cloudId}:${milestone}:${q.deadline}`;
      if (set.has(key)) continue;
      set.add(key);
      // Đã tới mốc 6h thì đánh dấu luôn mốc 1d (tránh nhắc lùi nếu chưa từng nhắc).
      if (milestone === '6h') set.add(`${q.cloudId}:1d:${q.deadline}`);
      const whenStr = new Date(due).toLocaleString('vi-VN');
      await sbSendNotification(user.u, {
        type: 'task',
        title: milestone === '6h' ? '🔴 Deadline báo giá sắp hết giờ' : '⏰ Deadline báo giá sắp đến',
        message: `Báo giá "${q.name}" — ${milestone === '6h' ? 'còn dưới 6 giờ' : 'còn dưới 1 ngày'} (${whenStr})`,
        createdBy: 'Hệ thống',
        data: { cloudId: q.cloudId },
      });
    }
    try { localStorage.setItem(QUOTE_DDL_KEY, JSON.stringify([...set].slice(-500))); } catch { /* ignore */ }
  } catch (e) {
    console.warn('checkQuoteDeadlines failed:', (e as Error).message);
  }
}

const NCC_DDL_KEY = 'vte_ncc_due_notified';
/** Số ngày trước hạn bắt đầu nhắc trả NCC. */
const NCC_REMIND_WITHIN = 7;

/**
 * Nhắc hạn thanh toán NCC: mỗi đợt thanh toán NCC chưa trả & có hạn (index `nccDue`)
 * sắp/đã đến hạn (≤7 ngày, gồm quá hạn) → nhắc người tạo & cộng tác viên báo giá.
 * Mỗi (báo giá, đợt, hạn) nhắc 1 lần (dedup localStorage). Quét index đã subscribe.
 */
export async function checkNccPayments(user: User): Promise<void> {
  try {
    const quotes = useQuoteHistoryStore.getState().quotes;
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(NCC_DDL_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const set = new Set(seen);
    for (const q of quotes) {
      const involved = new Set<string>([q.createdByUsername, ...(q.collaborators ?? []).map((c) => c.u)]);
      if (!involved.has(user.u)) continue;
      for (const due of q.nccDue ?? []) {
        const d = daysUntil(due.dueDate);
        if (d == null || d > NCC_REMIND_WITHIN) continue; // gồm cả quá hạn (d < 0)
        const key = `${q.cloudId}:${due.label}:${due.dueDate}`;
        if (set.has(key)) continue;
        set.add(key);
        const when = d < 0 ? `QUÁ HẠN ${Math.abs(d)} ngày` : d === 0 ? 'hôm nay' : `còn ${d} ngày`;
        const amount = (due.amount || 0).toLocaleString('vi-VN');
        const title = d < 0 ? '🔴 Quá hạn thanh toán NCC' : '⏰ Sắp đến hạn thanh toán NCC';
        const msg = `Báo giá "${q.name}" — ${due.supplier ? due.supplier + ' · ' : ''}${due.label}: ${amount} đ · ${when} (${new Date(due.dueDate).toLocaleDateString('vi-VN')})`;
        await sbSendNotification(user.u, {
          type: 'payment_due',
          title,
          message: msg,
          createdBy: 'Hệ thống',
          data: { cloudId: q.cloudId },
        });
        if (canReceivePush(user)) showPushNotif(title, msg, key);
      }
    }
    try { localStorage.setItem(NCC_DDL_KEY, JSON.stringify([...set].slice(-500))); } catch { /* ignore */ }
  } catch (e) {
    console.warn('checkNccPayments failed:', (e as Error).message);
  }
}

const SHARE_ACCEPT_KEY = 'vte_share_accept_notified';

/**
 * Nhắc khi KHÁCH đồng ý báo giá đã chia sẻ (link). Quét index báo giá có `share`
 * của người tạo, đọc bản công khai; nếu khách đã `acceptance` mà chưa nhắc → báo
 * người tạo. Dedup theo token (localStorage). Không tự đổi trạng thái báo giá.
 */
export async function checkQuoteAcceptances(user: User): Promise<void> {
  try {
    const quotes = useQuoteHistoryStore.getState().quotes.filter(
      (q) => q.share?.token && q.createdByUsername === user.u,
    );
    if (!quotes.length) return;
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(SHARE_ACCEPT_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const set = new Set(seen);
    for (const q of quotes) {
      const token = q.share!.token;
      const pub = await sbGetPublicQuote(token);
      if (!pub?.acceptance) continue;
      const key = `${token}:${pub.acceptance.at}`;
      if (set.has(key)) continue;
      set.add(key);
      const msg = `Báo giá "${q.name}"${pub.acceptance.name ? ` — ${pub.acceptance.name}` : ''} đã đồng ý chốt${pub.acceptance.note ? `: “${pub.acceptance.note}”` : ''}. Liên hệ xác nhận & chuyển trạng thái Thắng.`;
      await sbSendNotification(user.u, {
        type: 'task',
        title: '🎉 Khách đã đồng ý báo giá',
        message: msg,
        createdBy: 'Hệ thống',
        data: { cloudId: q.cloudId },
      });
      if (canReceivePush(user)) showPushNotif('🎉 Khách đã đồng ý báo giá', msg, key);
    }
    try { localStorage.setItem(SHARE_ACCEPT_KEY, JSON.stringify([...set].slice(-500))); } catch { /* ignore */ }
  } catch (e) {
    console.warn('checkQuoteAcceptances failed:', (e as Error).message);
  }
}

const DOC_EXP_KEY = 'vte_doc_expiry_notified';
/** Các mốc nhắc TRƯỚC khi hộ chiếu/visa hết hạn (ngày). */
const DOC_EXP_MILESTONES = [90, 30];

/**
 * Nhắc hộ chiếu/visa của khách sắp hết hạn. Quét khách hàng (đã subscribe); với mỗi
 * hồ sơ có ngày hết hạn ≤ mốc nhắc → báo cho người TẠO khách / phòng Visa / Operations.
 * Mỗi (khách, người, loại giấy, hạn, mốc) nhắc 1 lần (dedup localStorage).
 */
export async function checkDocExpiry(user: User): Promise<void> {
  try {
    const customers = useCustomerStore.getState().customers;
    const relevantAll = user.department === 'visa' || user.role === 'Operations';
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(DOC_EXP_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const set = new Set(seen);
    for (const c of customers) {
      // Người nhận: phòng Visa/Operations (mọi khách) hoặc người tạo khách.
      if (!relevantAll && c.createdBy !== user.name) continue;
      for (const t of c.travelers ?? []) {
        for (const [kind, label, iso] of [
          ['hc', 'Hộ chiếu', t.passportExpiry] as const,
          ['visa', `Visa${t.visaCountry ? ' ' + t.visaCountry : ''}`, t.visaExpiry] as const,
        ]) {
          if (!iso) continue;
          const d = daysUntil(iso);
          if (d == null) continue;
          const milestone = DOC_EXP_MILESTONES.find((m) => d <= m && d >= -1); // gồm vừa hết hạn
          if (milestone == null) continue;
          const key = `${c.id}:${t.id}:${kind}:${iso}:${milestone}`;
          if (set.has(key)) continue;
          // Đánh dấu cả mốc lớn hơn để không nhắc lùi.
          for (const m of DOC_EXP_MILESTONES) if (m >= milestone) set.add(`${c.id}:${t.id}:${kind}:${iso}:${m}`);
          const when = d < 0 ? 'ĐÃ HẾT HẠN' : `còn ${d} ngày`;
          await sbSendNotification(user.u, {
            type: 'task',
            title: d < 0 ? '🔴 Giấy tờ khách đã hết hạn' : '⏰ Giấy tờ khách sắp hết hạn',
            message: `${c.name} — ${t.fullName}: ${label} ${when} (${new Date(iso).toLocaleDateString('vi-VN')})`,
            createdBy: 'Hệ thống',
          });
        }
      }
    }
    try { localStorage.setItem(DOC_EXP_KEY, JSON.stringify([...set].slice(-800))); } catch { /* ignore */ }
  } catch (e) {
    console.warn('checkDocExpiry failed:', (e as Error).message);
  }
}

const TODO_REMIND_KEY = 'vte_todo_remind_notified';
const TODO_WINDOW = 7 * 86400000; // chỉ bắn mốc nhắc trong 7 ngày gần (tránh dồn cũ)

/**
 * Nhắc công việc (To-Do): với mỗi việc CHƯA xong mà người dùng phụ trách (người tạo
 * hoặc được giao), bắn thông báo khi tới mốc "trước hạn N" hoặc "khung giờ tuyệt đối",
 * và khi quá hạn. Mỗi (việc, mốc) nhắc 1 lần (dedup localStorage). Quét kho todos đã
 * subscribe. Gọi lúc đăng nhập + mỗi 5 phút (cùng nhịp checkNotifReminders).
 */
export async function checkTodoReminders(user: User): Promise<void> {
  try {
    const todos = useTodoStore.getState().todos;
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(TODO_REMIND_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const set = new Set(seen);
    const now = Date.now();
    const dt = (ms: number) => new Date(ms).toLocaleString('vi-VN');
    for (const t of todos) {
      if (t.status === 'done') continue;
      if (t.createdBy !== user.u && !t.assignees.includes(user.u)) continue;
      const fire = (key: string, when: number, label: string): Promise<void> | undefined => {
        if (isNaN(when) || now < when || now - when > TODO_WINDOW) return;
        const k = `${t.id}:${key}`;
        if (set.has(k)) return;
        set.add(k);
        return sbSendNotification(user.u, {
          type: 'task',
          title: key === 'overdue' ? '🔴 Việc quá hạn' : '⏰ Nhắc việc',
          message: `${t.title} — ${label}`,
          createdBy: 'Hệ thống',
          ...(t.link ? { link: t.link } : {}),
        });
      };
      const proms: (Promise<void> | undefined)[] = [];
      const due = t.dueDate ? new Date(t.dueDate).getTime() : NaN;
      if (!isNaN(due)) {
        for (const lead of t.remindLead ?? []) {
          const lbl = lead >= 1440 ? `còn ${Math.round(lead / 1440)} ngày` : lead >= 60 ? `còn ${Math.round(lead / 60)} giờ` : `còn ${lead} phút`;
          proms.push(fire(`lead${lead}`, due - lead * 60000, `${lbl} tới hạn (${dt(due)})`));
        }
        proms.push(fire('overdue', due, `đã quá hạn (${dt(due)})`));
      }
      for (const r of t.remindAt ?? []) proms.push(fire(`at:${r}`, new Date(r).getTime(), `nhắc lúc ${dt(new Date(r).getTime())}`));
      await Promise.all(proms);
    }
    try { localStorage.setItem(TODO_REMIND_KEY, JSON.stringify([...set].slice(-1000))); } catch { /* ignore */ }
  } catch (e) {
    console.warn('checkTodoReminders failed:', (e as Error).message);
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
      await sbSendNotification(user.u, {
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
      await sbSendNotification(user.u, {
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
    await sbSendNotification(user.u, {
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

// ── Hồ sơ tour: nhắc người THEO DÕI / CỘNG TÁC khi đổi giai đoạn hoặc sắp khởi hành ──
const TPF_DEP_KEY = 'vte_tour_profile_dep_notified';     // dedup mốc khởi hành (1 lần/mốc)
const TPF_STAGE_KEY = 'vte_tour_profile_stage_seen';     // baseline giai đoạn đã thấy {pid:u -> stage}
const TPF_RISK_KEY = 'vte_tour_profile_risk_notified';   // dedup cảnh báo "cần chú ý" (1 lần/ngày/bộ-risk)

const STAGE_LABEL = (st: DealStage): string => stageMeta(st).short;

/**
 * Nhắc người theo dõi (follower) & cộng tác (collaborator) một hồ sơ tour khi:
 *  (1) giai đoạn (suy từ báo giá chính) THAY ĐỔI so với lần thấy trước, và
 *  (2) tour sắp khởi hành (mốc 7/3/1 ngày).
 * Chạy per-user trong vòng nhắc của MainApp; dedup qua localStorage như các check khác.
 */
export async function checkTourProfileFollowers(user: User): Promise<void> {
  try {
    const profiles = useTourProfileStore.getState().profiles;
    const quotes = useQuoteHistoryStore.getState().quotes;
    const contracts = useContractStore.getState().contracts;

    let depSeen: string[] = [];
    try { depSeen = JSON.parse(localStorage.getItem(TPF_DEP_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const depSet = new Set(depSeen);
    let stageSeen: Record<string, string> = {};
    try { stageSeen = JSON.parse(localStorage.getItem(TPF_STAGE_KEY) ?? '{}') as Record<string, string>; } catch { /* ignore */ }
    let riskSeen: string[] = [];
    try { riskSeen = JSON.parse(localStorage.getItem(TPF_RISK_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const riskSet = new Set(riskSeen);

    for (const p of profiles) {
      if (p.status === 'archived') continue;
      const involved =
        (p.followers ?? []).some((f) => f.u === user.u) ||
        (p.collaborators ?? []).some((c) => c.u === user.u);
      if (!involved) continue;

      const pqs = quotes.filter((q) => q.tourProfileId === p.id);
      const pq = pqs.find((q) => q.cloudId === p.primaryQuoteId) ?? pqs[0];
      if (!pq) continue;
      const c = contracts.find((x) => x.linkedQuoteId === pq.cloudId);
      const tpLink = { kind: 'tourProfile' as const, id: p.id, label: p.code };
      const stage = effectiveStage(p.manualStage, dealStage({ status: pq.status, contract: contractFlags(c), departureISO: pq.departDate }));
      const link = p.primaryQuoteId
        ? { kind: 'quote' as const, id: p.primaryQuoteId, label: p.code }
        : undefined;

      // (1) đổi giai đoạn — chỉ nhắc khi đã có baseline & khác baseline (lần đầu chỉ ghi nhận).
      const sKey = `${p.id}:${user.u}`;
      const last = stageSeen[sKey];
      if (last && last !== stage) {
        await sbSendNotification(user.u, {
          type: 'announcement',
          title: `🔔 Hồ sơ ${p.code} chuyển giai đoạn`,
          message: `Tour "${p.name || p.code}" bạn đang theo dõi đã chuyển sang giai đoạn “${STAGE_LABEL(stage)}”.`,
          createdBy: 'Hệ thống',
          ...(link ? { link } : {}),
        });
      }
      stageSeen[sKey] = stage;

      // (2) sắp khởi hành — mốc 7/3/1 ngày, mỗi mốc 1 lần.
      const d = daysUntil(pq.departDate);
      if (d !== null && d >= 0) {
        const ms = d <= 1 ? '1d' : d <= 3 ? '3d' : d <= 7 ? '7d' : null;
        if (ms) {
          const key = `${p.id}:${user.u}:${ms}:${pq.departDate}`;
          if (!depSet.has(key)) {
            depSet.add(key);
            await sbSendNotification(user.u, {
              type: 'announcement',
              title: '🧭 Tour theo dõi sắp khởi hành',
              message: `Tour "${p.name || p.code}" khởi hành ${new Date(pq.departDate!).toLocaleDateString('vi-VN')} — còn ~${d} ngày.`,
              createdBy: 'Hệ thống',
              ...(link ? { link } : {}),
            });
          }
        }
      }

      // (3) cảnh báo "cần chú ý" — chỉ nhắc khi có rủi ro MỨC GẤP, 1 lần/ngày/bộ-risk.
      const contractCount = contracts.filter((x) => x.tourProfileId === p.id || pqs.some((q) => q.cloudId === x.linkedQuoteId)).length;
      const urgent = tourProfileRisks({ primary: pq, stage, contractCount }).filter((r) => r.level === 'urgent');
      if (urgent.length) {
        const today = new Date().toISOString().slice(0, 10);
        const rKey = `${p.id}:${user.u}:${today}:${urgent.map((r) => r.key).sort().join(',')}`;
        if (!riskSet.has(rKey)) {
          riskSet.add(rKey);
          await sbSendNotification(user.u, {
            type: 'announcement',
            priority: 'high',
            title: `⚠️ Hồ sơ ${p.code} cần chú ý`,
            message: `Tour "${p.name || p.code}": ${urgent.map((r) => r.label).join(' · ')}.`,
            createdBy: 'Hệ thống',
            link: tpLink,
          });
        }
      }
    }

    try { localStorage.setItem(TPF_DEP_KEY, JSON.stringify([...depSet].slice(-500))); } catch { /* ignore */ }
    // Chặn phình: baseline giai đoạn là object map (không slice được như Set) → giữ
    // ~2000 mục gần nhất (thứ tự chèn của object string-key được bảo toàn trong JS).
    try {
      const entries = Object.entries(stageSeen);
      const bounded = entries.length > 2000 ? Object.fromEntries(entries.slice(-2000)) : stageSeen;
      localStorage.setItem(TPF_STAGE_KEY, JSON.stringify(bounded));
    } catch { /* ignore */ }
    try { localStorage.setItem(TPF_RISK_KEY, JSON.stringify([...riskSet].slice(-500))); } catch { /* ignore */ }
  } catch (e) {
    console.warn('checkTourProfileFollowers failed:', (e as Error).message);
  }
}
