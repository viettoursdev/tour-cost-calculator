import type { CloudQuoteEntry, QuoteDraft } from '@/types';
import { workflowDueSummary, workflowBoardSummary } from '@/components/quote/workflowConstants';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { sbGetQuoteProject, sbBackfillWorkflowIndex } from '@/lib/supabase';

type IndexUpdate = Pick<CloudQuoteEntry, 'workflowDue' | 'workflowSummary' | 'departDate'>;

/**
 * Suy chỉ số index (workflowSummary/workflowDue/departDate) từ state đầy đủ của 1
 * báo giá — thuần. LUÔN trả workflowSummary (kể cả total 0) để ĐÁNH DẤU đã quét,
 * tránh quét lại báo giá không có quy trình ở các phiên sau.
 */
export function computeIndexUpdate(state: QuoteDraft | undefined): IndexUpdate {
  const steps = state?.workflow ?? [];
  const upd: IndexUpdate = {
    workflowDue: workflowDueSummary(steps),
    workflowSummary: workflowBoardSummary(steps),
  };
  if (state?.info?.startDate) upd.departDate = state.info.startDate;
  return upd;
}

let ran = false;
const CAP = 15; // số báo giá tối đa quét mỗi phiên (bù dần qua nhiều phiên)

/**
 * Backfill NỀN chỉ số quy trình cho báo giá cũ (thiếu `workflowSummary`) để Bảng
 * điều phối & Dashboard SLA hiển thị đúng mà không cần bấm "Cập nhật chỉ số" tay.
 * Chạy 1 lần/phiên, giới hạn CAP; best-effort (không chặn UI, nuốt lỗi).
 */
export async function autoBackfillWorkflowIndex(): Promise<void> {
  if (ran) return;
  ran = true;
  try {
    const missing = useQuoteHistoryStore.getState().visibleQuotes()
      .filter((q) => !q.workflowSummary)
      .slice(0, CAP);
    if (!missing.length) return;
    const updates: Record<string, IndexUpdate> = {};
    for (const q of missing) {
      const proj = await sbGetQuoteProject(q.cloudId).catch(() => null);
      if (!proj) continue;
      updates[q.cloudId] = computeIndexUpdate(proj.currentState);
    }
    if (Object.keys(updates).length) await sbBackfillWorkflowIndex(updates);
  } catch (e) {
    console.warn('autoBackfillWorkflowIndex failed:', (e as Error).message);
  }
}
