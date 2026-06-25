import { computeTotals, fmtVND, usedForeignCurrencies } from '@/components/quote/calc';
import { effectiveValidUntil, fmtDateVN, isoDate } from '@/components/quote/quoteValidity';
import type { Itinerary, PublicQuoteDoc, PublicQuoteItinDay, QuoteDraft } from '@/types';

/** Token ngẫu nhiên cho link chia sẻ (khó đoán). */
export function genShareToken(): string {
  const rnd = () => Math.random().toString(36).slice(2);
  try {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return (rnd() + rnd() + rnd()).slice(0, 24);
  }
}

/** URL link chia sẻ (tôn trọng base path GitHub Pages). */
export function shareUrl(token: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
  return `${base.replace(/\/$/, '/')}?share=${token}`;
}

/** Rút lịch trình (Itinerary) thành tóm tắt theo ngày cho khách. */
export function itineraryToSummary(itin: Itinerary): PublicQuoteItinDay[] {
  return (itin.schedule ?? []).map((d) => ({
    day: d.dayNum,
    title: d.title || undefined,
    lines: d.segments.flatMap((s) => s.activities.map((a) => [a.time, a.text].filter(Boolean).join(' '))).filter(Boolean),
  }));
}

/** Dựng bản báo giá HƯỚNG KHÁCH từ draft (ẩn giá vốn). */
export function buildPublicQuote(opts: {
  draft: QuoteDraft;
  token: string;
  cloudId: string;
  quoteCode?: string;
  publishedBy: string;
  customerName?: string;
  itinerary?: PublicQuoteItinDay[];
  note?: string;
}): PublicQuoteDoc {
  const { draft } = opts;
  const totals = computeTotals(draft);
  const publishedAt = new Date().toISOString();
  const validUntil = effectiveValidUntil(draft.validUntil, isoDate(new Date(publishedAt)));
  const fx = usedForeignCurrencies(draft.items);
  const rateNote = fx.length
    ? `Tỷ giá áp dụng${draft.rateDate ? ` ngày ${fmtDateVN(draft.rateDate)}` : ''}: ${fx.map((c) => `1 ${c} = ${fmtVND(draft.rates[c] ?? 0)}`).join(' · ')}. Giá có thể điều chỉnh nếu tỷ giá biến động đáng kể tại thời điểm xác nhận.`
    : undefined;
  return {
    token: opts.token,
    quoteCloudId: opts.cloudId,
    quoteCode: opts.quoteCode,
    tourName: draft.info.name || 'Chương trình tour',
    dest: draft.info.dest || undefined,
    customerName: opts.customerName,
    pax: draft.pax,
    days: draft.info.days,
    nights: draft.info.nights,
    startDate: draft.info.startDate ?? null,
    pricePerPax: Math.round(totals.roundedPPax),
    totalPrice: Math.round(totals.grandTotal),
    validUntil,
    ...(rateNote ? { rateNote } : {}),
    inclusions: (draft.inclusions ?? []).filter(Boolean),
    exclusions: (draft.exclusions ?? []).filter(Boolean),
    ...((draft.cancellation ?? []).some((c) => c.when.trim() || c.penalty)
      ? { cancellation: (draft.cancellation ?? []).filter((c) => c.when.trim() || c.penalty).map((c) => ({ when: c.when, penalty: c.penalty })) }
      : {}),
    payments: (draft.payments ?? []).map((p) => ({ label: p.label, amount: p.amount, note: p.note })),
    ...(opts.itinerary && opts.itinerary.length ? { itinerary: opts.itinerary } : {}),
    ...(opts.note ? { note: opts.note } : {}),
    publishedAt,
    publishedBy: opts.publishedBy,
  };
}
