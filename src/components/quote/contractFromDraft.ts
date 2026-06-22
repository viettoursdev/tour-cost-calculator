// ════════════════════════════════════════════════════════════════════════
//  Đợt 2 — Bàn giao 1 chạm: dựng hợp đồng từ BÁO GIÁ đang mở.
//
//  Hàm thuần (không IO) prefill hợp đồng từ ngữ cảnh báo giá + khách hàng, và
//  QUAN TRỌNG NHẤT là thiết lập sợi dây CRM `linkedQuoteId`/`linkedQuoteName` để
//  báo giá ↔ hợp đồng mở chéo được 2 chiều. Tách riêng để test & tái dùng cho
//  cả nhánh QuoteToolbar lẫn ContractView. Cổng chặn (won) do `dealStage` lo.
// ════════════════════════════════════════════════════════════════════════
import type { Contract, ContractPartyB, Customer } from '@/types';

/** Ngữ cảnh báo giá cần để dựng hợp đồng (rút từ `quoteStore.draft`). */
export interface QuoteContractCtx {
  quoteId: string | null;
  name: string;
  dest?: string;
  days: number;
  nights: number;
  pax: number;
  pricePerPax: number;
  startDateISO?: string | null;
  inclusions?: string[];
  exclusions?: string[];
  payments?: { id: string; label: string; amount: number; note?: string }[];
  customer?: Customer | null;
}

/** Map khách hàng → Bên B của hợp đồng (lấy liên hệ đầu tiên làm đại diện). */
export function customerToPartyB(c: Customer): ContractPartyB {
  const k = c.contacts?.[0];
  return {
    name: c.name ?? '',
    address: c.address ?? '',
    taxCode: c.taxCode ?? '',
    rep: k?.name ?? '',
    title: k?.position?.trim() || 'Giám đốc',
    tel: k?.phone ?? '',
    email: k?.email ?? '',
  };
}

/**
 * Dựng hợp đồng từ báo giá đang mở: prefill thông tin tour + Bên B từ khách, và
 * THIẾT LẬP liên kết 2 chiều. `base` thường là `emptyContract(createdBy)` để giữ
 * sẵn các điều khoản mặc định (includes/excludes/cancels/bond…).
 */
export function buildContractFromQuote(base: Contract, ctx: QuoteContractCtx): Contract {
  const inc = ctx.inclusions?.filter((s) => s.trim());
  const exc = ctx.exclusions?.filter((s) => s.trim());
  return {
    ...base,
    tourName: ctx.name || base.tourName,
    tourDest: ctx.dest || base.tourDest,
    tourDays: ctx.days,
    tourNights: ctx.nights,
    contractPax: ctx.pax,
    pricePerPax: ctx.pricePerPax,
    ...(ctx.startDateISO ? { tourStartDate: ctx.startDateISO.slice(0, 10) } : {}),
    ...(inc && inc.length ? { includes: inc } : {}),
    ...(exc && exc.length ? { excludes: exc } : {}),
    ...(ctx.payments && ctx.payments.length
      ? {
          payments: ctx.payments.map((p) => ({
            id: p.id,
            label: p.label,
            amount: p.amount,
            dueDate: '',
            note: p.note ?? '',
            status: 'pending' as const,
          })),
        }
      : {}),
    ...(ctx.customer ? { partyB: customerToPartyB(ctx.customer) } : {}),
    // ── Sợi dây CRM: liên kết 2 chiều báo giá ↔ hợp đồng ──
    linkedQuoteId: ctx.quoteId ?? null,
    ...(ctx.name ? { linkedQuoteName: ctx.name } : {}),
  };
}
