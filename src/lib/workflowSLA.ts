import type { CloudQuoteEntry, WorkflowStep } from '@/types';
import { cycleTimeMs } from '@/components/quote/workflowConstants';

// ── Phân tích SLA & nút thắt (bottleneck) cho Quy trình điều hành ─────────────
// Hai tầng dữ liệu:
//  • slaFromIndex — TỨC THÌ, chỉ đọc chỉ mục lịch sử báo giá (workflowSummary +
//    workflowDue) đã subscribe sẵn → "tour đang kẹt ở bước nào / bước nào hay
//    quá hạn nhất". Không cần tải từng báo giá.
//  • cycleStats — QUÉT SÂU, cần các bước đầy đủ (có nhật ký) để tính thời gian
//    xử lý thật mỗi bước (cycleTimeMs) + tỷ lệ đúng hạn.

const DAY = 86400000;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Nút thắt của 1 bước (gộp theo NHÃN — khớp `workflowSummary.current`). */
export type StepBottleneck = {
  label: string;
  stuck: number;         // số tour đang dừng ở bước này (là bước hiện tại)
  stuckOverdue: number;  // trong đó bao nhiêu tour có ≥1 bước quá hạn
  overdueDue: number;    // số lượt "đến hạn & chưa xong" mang nhãn này (từ workflowDue)
};

export type WorkflowSLAIndex = {
  totals: { withWf: number; running: number; overdue: number; avgDonePct: number };
  /** Sắp: kẹt nhiều nhất trước, rồi quá hạn nhiều nhất. */
  bottlenecks: StepBottleneck[];
};

/** Gom nút thắt từ CHỈ MỤC báo giá (không cần tải chi tiết). */
export function slaFromIndex(entries: CloudQuoteEntry[], todayISO?: string): WorkflowSLAIndex {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  const withWf = entries.filter((q) => q.workflowSummary && q.workflowSummary.total > 0);
  const running = withWf.filter((q) => (q.workflowSummary!.donePct ?? 0) < 100);
  const overdue = withWf.filter((q) => (q.workflowSummary!.overdue ?? 0) > 0);
  const avgDonePct = withWf.length
    ? Math.round(withWf.reduce((a, q) => a + (q.workflowSummary!.donePct || 0), 0) / withWf.length)
    : 0;

  const map = new Map<string, StepBottleneck>();
  const get = (label: string): StepBottleneck => {
    let b = map.get(label);
    if (!b) { b = { label, stuck: 0, stuckOverdue: 0, overdueDue: 0 }; map.set(label, b); }
    return b;
  };
  for (const q of running) {
    const cur = q.workflowSummary!.current;
    if (!cur) continue;
    const b = get(cur);
    b.stuck++;
    if ((q.workflowSummary!.overdue ?? 0) > 0) b.stuckOverdue++;
  }
  for (const q of withWf) {
    for (const w of q.workflowDue ?? []) {
      if (w.dueDate < today) get(w.label).overdueDue++;
    }
  }
  const bottlenecks = [...map.values()].sort((a, b) =>
    (b.stuck - a.stuck) || (b.overdueDue - a.overdueDue) || a.label.localeCompare(b.label, 'vi'));
  return { totals: { withWf: withWf.length, running: running.length, overdue: overdue.length, avgDonePct }, bottlenecks };
}

/** Thống kê thời gian xử lý 1 bước (gộp theo nhãn) — từ QUÉT SÂU. */
export type StepCycle = {
  label: string;
  samples: number;            // số bước tính được thời gian xử lý
  avgDays: number;
  medianDays: number;
  doneWithDue: number;        // số bước done & có Hạn (mẫu số tỷ lệ đúng hạn)
  lateDone: number;           // done nhưng trễ hạn
  onTimeRate: number | null;  // % done đúng/ trước hạn; null nếu không có mẫu
};

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Gom thời gian xử lý & tỷ lệ đúng hạn theo nhãn bước, qua nhiều workflow.
 * Sắp theo thời gian xử lý TB giảm dần (bước "chậm" nhất lên đầu).
 */
export function cycleStats(workflows: WorkflowStep[][], _todayISO?: string): StepCycle[] {
  const acc = new Map<string, { ms: number[]; doneWithDue: number; lateDone: number }>();
  const get = (label: string) => {
    let a = acc.get(label);
    if (!a) { a = { ms: [], doneWithDue: 0, lateDone: 0 }; acc.set(label, a); }
    return a;
  };
  for (const steps of workflows) {
    for (const s of steps) {
      const a = get(s.label);
      const c = cycleTimeMs(s);
      if (c != null) a.ms.push(c);
      if (s.status === 'done' && s.dueDate) {
        a.doneWithDue++;
        const done = s.doneDate ?? s.dueDate;
        if (done > s.dueDate) a.lateDone++;
      }
    }
  }
  const out: StepCycle[] = [];
  for (const [label, a] of acc) {
    const avgMs = a.ms.length ? a.ms.reduce((x, y) => x + y, 0) / a.ms.length : 0;
    out.push({
      label,
      samples: a.ms.length,
      avgDays: round1(avgMs / DAY),
      medianDays: round1(median(a.ms) / DAY),
      doneWithDue: a.doneWithDue,
      lateDone: a.lateDone,
      onTimeRate: a.doneWithDue ? Math.round(((a.doneWithDue - a.lateDone) / a.doneWithDue) * 100) : null,
    });
  }
  return out.sort((x, y) => (y.avgDays - x.avgDays) || (y.samples - x.samples) || x.label.localeCompare(y.label, 'vi'));
}
