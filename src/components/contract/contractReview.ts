import { callAIWorker, markExtract } from '@/lib/aiWorker';
import type { Contract } from '@/types';

const fmtV = (n: number) => Math.round(n || 0).toLocaleString('vi-VN') + ' đ';

/** Kiểm tra số liệu tất định (không cần AI) — chạy ngay, không tốn token. */
export type NumericCheck = { label: string; detail: string; level: 'ok' | 'warn' };

export function numericChecks(c: Contract): NumericCheck[] {
  const total = Math.round((c.pricePerPax || 0) * (c.contractPax || 0));
  const out: NumericCheck[] = [
    { label: 'Tổng giá trị HĐ', detail: `${fmtV(total)} ( = ${fmtV(c.pricePerPax || 0)} × ${c.contractPax || 0} khách )`, level: 'ok' },
  ];
  const pays = c.payments ?? [];
  if (pays.length) {
    const paid = pays.reduce((s, p) => s + (p.amount || 0), 0);
    const diff = paid - total;
    out.push({
      label: 'Tổng các đợt thanh toán',
      detail: Math.abs(diff) > 1 ? `${fmtV(paid)} — LỆCH ${diff > 0 ? '+' : ''}${fmtV(diff)} so với tổng HĐ` : `${fmtV(paid)} — khớp tổng HĐ`,
      level: Math.abs(diff) > 1 ? 'warn' : 'ok',
    });
    if (c.tourStartDate) {
      const late = pays.filter((p) => p.dueDate && p.dueDate > c.tourStartDate!);
      if (late.length) out.push({ label: 'Hạn thanh toán', detail: `${late.length} đợt có hạn SAU ngày khởi hành`, level: 'warn' });
    }
  }
  return out;
}

/** Văn bản hợp đồng dạng đọc được để gửi cho AI rà soát. */
export function buildContractText(c: Contract): string {
  const total = Math.round((c.pricePerPax || 0) * (c.contractPax || 0));
  const L: string[] = [];
  L.push(`SỐ HĐ: ${c.contractNo || '(trống)'} · Ngày: ${c.contractDate || '(trống)'} · Trạng thái: ${c.contractStatus}`);
  L.push(`TOUR: ${c.tourName || '(trống)'} — ${c.tourDest || ''}, ${c.tourDays} ngày ${c.tourNights} đêm, khởi hành từ ${c.departure || '?'} ngày ${c.tourStartDate || '(chưa có)'}`);
  L.push(`SỐ KHÁCH: ${c.contractPax} · ĐƠN GIÁ/KHÁCH: ${fmtV(c.pricePerPax || 0)} · TỔNG: ${fmtV(total)}`);
  L.push(`BÊN B: ${c.partyB?.name || '(trống)'} · Địa chỉ: ${c.partyB?.address || '(trống)'} · MST: ${c.partyB?.taxCode || '(trống)'} · Đại diện: ${c.partyB?.rep || '(trống)'} (${c.partyB?.title || ''})`);
  L.push(`BAO GỒM: ${(c.includes ?? []).join('; ') || '(trống)'}`);
  L.push(`KHÔNG BAO GỒM: ${(c.excludes ?? []).join('; ') || '(trống)'}`);
  L.push('THANH TOÁN:');
  (c.payments ?? []).forEach((p, i) => L.push(`  ${i + 1}. ${p.label || ''}: ${fmtV(p.amount || 0)}${p.percent ? ` (${p.percent}%)` : ''}, hạn ${p.dueDate || '?'} [${p.status}]`));
  L.push('HỦY/PHẠT:');
  (c.cancels ?? []).forEach((x) => L.push(`  - ${x.when}: phạt ${x.penalty}%`));
  L.push(`KÝ QUỸ/BẢO LÃNH: ${c.bondPercent || 0}%`);
  return L.join('\n');
}

export type ReviewSeverity = 'cao' | 'trung bình' | 'thấp';
export type ReviewFinding = { severity: ReviewSeverity; category: string; issue: string; suggestion: string };
export type ContractReview = { summary: string; findings: ReviewFinding[] };

const SYSTEM = [
  'Bạn là chuyên gia pháp lý & vận hành hợp đồng du lịch lữ hành, rà soát hợp đồng GIÚP BÊN A (công ty lữ hành Viettours).',
  'Phân tích hợp đồng và chỉ ra: rủi ro pháp lý/thương mại cho Bên A; điều khoản thiếu hoặc mơ hồ; mâu thuẫn số liệu/ngày tháng; đề xuất chỉnh sửa cụ thể.',
  'CHỈ trả về JSON hợp lệ, tiếng Việt, KHÔNG kèm giải thích ngoài JSON, theo schema:',
  '{"summary":"1-2 câu tổng quan","findings":[{"severity":"cao|trung bình|thấp","category":"ngắn gọn","issue":"vấn đề","suggestion":"đề xuất sửa"}]}',
  'Tối đa 8 findings, ưu tiên quan trọng nhất. Nếu hợp đồng ổn, findings có thể rỗng.',
].join('\n');

/** Tách & kiểm tra JSON review từ phản hồi AI. */
export function parseReview(text: string): ContractReview | null {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try {
    const o = JSON.parse(text.slice(s, e + 1)) as Partial<ContractReview>;
    if (typeof o.summary === 'string' && Array.isArray(o.findings)) {
      return { summary: o.summary, findings: o.findings as ReviewFinding[] };
    }
  } catch { /* ignore */ }
  return null;
}

/** Gọi AI rà soát hợp đồng → trả về review có cấu trúc. */
export async function reviewContractAI(c: Contract): Promise<ContractReview> {
  const res = await callAIWorker('/chat', { system: markExtract(SYSTEM), messages: [{ role: 'user', content: buildContractText(c) }] });
  if (res.error) throw new Error(res.error);
  const text = (res.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim() || res.text || '';
  const review = parseReview(text);
  if (!review) throw new Error('AI trả về không đúng định dạng. Vui lòng thử lại.');
  return review;
}
