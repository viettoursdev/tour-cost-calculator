import { callAIWorker, markExtract, type ContentBlock } from '@/lib/aiWorker';
import type { WinFactor } from '@/components/quote/winScore';

/** Lớp AI TÙY CHỌN cho #3/#5 — chỉ DIỄN GIẢI kết quả heuristic (không thay thế).
 *  Người dùng tự bấm nút mới gọi; lõi điểm/giá vẫn chạy offline. */

const WIN_SYSTEM =
  'Bạn là trợ lý kinh doanh tour. Dựa trên các YẾU TỐ chấm điểm khả năng chốt một '
  + 'báo giá, giải thích NGẮN GỌN bằng tiếng Việt (≤4 câu) vì sao điểm như vậy và '
  + 'gợi ý 1–2 hành động kế tiếp để tăng khả năng chốt. KHÔNG bịa thêm số liệu.';

function textOf(content: ContentBlock[] | undefined): string {
  return (content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
}

export async function explainWinScore(input: {
  name: string; customer?: string; score: number; band: string; value: number; factors: WinFactor[];
}): Promise<string> {
  const content: ContentBlock[] = [{
    type: 'text',
    text:
      `Báo giá: ${input.name}\nKhách: ${input.customer ?? '—'}\nGiá trị: ${input.value} VND\n`
      + `Điểm khả năng chốt: ${input.score}/100 (${input.band})\nYếu tố:\n`
      + input.factors.map((f) => `- ${f.label}: ${f.impact > 0 ? '+' : ''}${f.impact}`).join('\n'),
  }];
  const res = await callAIWorker('/chat', { system: markExtract(WIN_SYSTEM), messages: [{ role: 'user', content }] });
  return textOf(res.content);
}

const PRICE_SYSTEM =
  'Bạn là chuyên gia định giá tour. Dựa trên dải biên% của các báo giá THẮNG so với '
  + 'báo giá hiện tại, giải thích NGẮN GỌN bằng tiếng Việt (≤4 câu) báo giá đang ở vị trí '
  + 'nào và nên điều chỉnh giá/biên thế nào để dễ thắng mà vẫn giữ lợi nhuận. KHÔNG bịa số liệu.';

export async function explainPricing(input: {
  template: string; dest?: string; pax: number;
  currentMarginPct?: number; wonBand?: [number, number]; sampleN: number; verdict: string;
}): Promise<string> {
  const content: ContentBlock[] = [{
    type: 'text',
    text:
      `Loại: ${input.template} · Điểm đến: ${input.dest ?? '—'} · ${input.pax} khách\n`
      + `Biên hiện tại: ${input.currentMarginPct?.toFixed(1) ?? '—'}%\n`
      + `Dải biên báo giá THẮNG (p25–p75): ${input.wonBand ? `${input.wonBand[0].toFixed(1)}–${input.wonBand[1].toFixed(1)}%` : 'chưa đủ mẫu'}\n`
      + `Số mẫu so sánh: ${input.sampleN}\nĐánh giá heuristic: ${input.verdict}`,
  }];
  const res = await callAIWorker('/chat', { system: markExtract(PRICE_SYSTEM), messages: [{ role: 'user', content }] });
  return textOf(res.content);
}
