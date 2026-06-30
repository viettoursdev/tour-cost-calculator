/**
 * Customer-facing HTML rendering of the quote, used as the capture source for
 * the image-based PDF export (exportPDFImage). Rendered off-screen.
 */
import { forwardRef } from 'react';
import { calcVND, computeTotals, fmtVND, usedForeignCurrencies } from './calc';
import { effectiveValidUntil, fmtDateVN, isoDate } from './quoteValidity';
import { getCATS } from './constants';
import { pricingLines } from './pricing';
import { VTE_LOGO } from '@/lib/exports/vteLogo';
import { BRAND_HOTLINE } from '@/lib/exports/brand';
import type { Item, QuoteDraft } from '@/types';

const TEAL = '#14a08c';
const DARK = '#0f3a4a';
const GOLD = '#f5a623';

type Props = {
  draft: QuoteDraft;
  savedBy: { name: string; role: string; email?: string; phone?: string };
  /** Package mode: hide per-item prices, show group-size table + supplements. */
  pkg?: boolean;
};

export const QuotePrintable = forwardRef<HTMLDivElement, Props>(({ draft, savedBy, pkg = false }, ref) => {
  const { info, items, rates, pax, catEnabled, template } = draft;
  const totals = computeTotals(draft);
  const roundedPPax = totals.roundedPPax;
  const activeCATS = template && template !== 'dmc' ? getCATS(template) : [];

  const startD = info.startDate ? new Date(info.startDate) : null;
  const endD = startD ? new Date(startD.getTime() + (info.days - 1) * 86400000) : null;
  const fmtD = (d: Date) => d.toLocaleDateString('vi-VN');

  const inclusions = (draft.inclusions ?? []).filter((s) => s.trim());
  const exclusions = (draft.exclusions ?? []).filter((s) => s.trim());
  const payments = (draft.payments ?? []).filter((p) => p.label.trim() || p.amount || p.note.trim());
  const cancels = (draft.cancellation ?? []).filter((c) => c.when.trim() || c.penalty);

  // Hiệu lực báo giá (hạn đặt tay hoặc mặc định N ngày) + dấu tỷ giá áp dụng.
  const validUntil = effectiveValidUntil(draft.validUntil, isoDate(new Date()));
  const fxUsed = usedForeignCurrencies(items);

  const groupVariants = (draft.groups && draft.groups.length)
    ? draft.groups.map((g) => (g.id === draft.activeGroupId
        ? { label: g.label, pax, items, catEnabled }
        : { label: g.label, pax: g.pax, items: g.items, catEnabled: g.catEnabled }))
    : null;
  const addOns = pkg ? pricingLines(draft.pricingOptions, roundedPPax) : [];

  const optItems: { name: string; vnd: number }[] = [];
  activeCATS.forEach((cat) => {
    if (!catEnabled[cat.id as keyof typeof catEnabled]) return;
    (items[cat.id as keyof typeof items] ?? []).forEach((i: Item) => {
      if (i.optional && i.name && !i.foc) optItems.push({ name: i.name, vnd: calcVND(i, rates, pax) });
    });
  });

  return (
    <div
      ref={ref}
      style={{
        width: 760, padding: 28, background: '#fff', color: DARK, boxSizing: 'border-box',
        fontFamily: 'Arial, "Segoe UI", sans-serif', fontSize: 13, lineHeight: 1.5,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <img src={VTE_LOGO} alt="Viettours" style={{ width: 120, height: 'auto' }} />
          <div>
            <div style={{ color: TEAL, fontWeight: 800, fontSize: 17 }}>VIETTOURS INCENTIVES &amp; EVENTS</div>
            <div style={{ color: '#7a828a', fontSize: 11 }}>Hotline {BRAND_HOTLINE} · www.viettours.com.vn</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: '#7a828a' }}>
          <div style={{ fontSize: 10, letterSpacing: 1 }}>NHÂN VIÊN BÁO GIÁ</div>
          <div style={{ color: DARK, fontWeight: 700, fontSize: 13 }}>{savedBy.name}</div>
          {savedBy.phone && <div>ĐT: {savedBy.phone}</div>}
          {savedBy.email && <div>{savedBy.email}</div>}
        </div>
      </div>

      {/* Title band */}
      <div style={{ background: `linear-gradient(135deg,#0d7a6a,${TEAL})`, color: '#fff', borderRadius: 8, padding: '16px 20px', textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 12, opacity: 0.85, letterSpacing: 1 }}>BÁO GIÁ TOUR / QUOTATION</div>
        <div style={{ fontSize: 22, fontWeight: 800, margin: '4px 0' }}>{info.name || 'Tour'}</div>
        <div style={{ color: '#ffe082', fontSize: 13 }}>
          {info.dest || ''} · {info.days}N{info.nights}Đ · {pax} khách
        </div>
        {startD && endD && (
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
            Khởi hành: {fmtD(startD)} → Kết thúc: {fmtD(endD)}
          </div>
        )}
      </div>

      {/* Price box — single, or group-size table in package mode */}
      {pkg && groupVariants ? (
        <div style={{ background: DARK, color: '#fff', borderRadius: 8, padding: '14px 20px', marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'center', marginBottom: 8, color: '#cfe6e0' }}>
            GIÁ TRỌN GÓI THEO MỨC KHÁCH / PACKAGE BY GROUP SIZE
          </div>
          {groupVariants.map((g, i) => {
            const gv = computeTotals({ ...draft, pax: g.pax, items: g.items, catEnabled: g.catEnabled });
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderTop: i ? '1px solid rgba(255,255,255,0.12)' : 'none' }}>
                <span style={{ fontWeight: 700 }}>{g.label} ({g.pax} khách)</span>
                <span style={{ color: '#a8e6dd' }}>{fmtVND(gv.roundedPPax)}/khách</span>
                <span style={{ color: '#ffe082', fontWeight: 800 }}>{fmtVND(gv.roundedPPax * g.pax)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: '#fff8e1', border: `1px solid ${GOLD}`, borderRadius: 8, padding: '12px 20px', textAlign: 'center', marginBottom: 18 }}>
          <div style={{ color: TEAL, fontWeight: 700, fontSize: 12 }}>GIÁ TRỌN GÓI / KHÁCH · PACKAGE PRICE / PAX</div>
          <div style={{ color: '#dc3250', fontWeight: 900, fontSize: 30 }}>{fmtVND(roundedPPax)}</div>
          <div style={{ color: DARK, fontSize: 12 }}>Tổng đoàn {pax} khách: {fmtVND(roundedPPax * pax)}</div>
        </div>
      )}

      {/* Services */}
      <div style={{ color: TEAL, fontWeight: 800, fontSize: 14, borderBottom: `2px solid ${TEAL}`, paddingBottom: 4, marginBottom: 8 }}>
        DỊCH VỤ BAO GỒM / INCLUDED SERVICES
      </div>
      {activeCATS.map((cat) => {
        const catItems = (items[cat.id as keyof typeof items] ?? [])
          .filter((i: Item) => i.name && !i.optional && (calcVND(i, rates, pax) > 0 || i.foc === true));
        if (!catEnabled[cat.id as keyof typeof catEnabled] || catItems.length === 0) return null;
        const sub = catItems.reduce((s: number, i: Item) => s + calcVND(i, rates, pax), 0);
        return (
          <div key={cat.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: DARK }}>
              <span>{cat.icon} {cat.label}</span>
              {!pkg && <span style={{ color: TEAL }}>{pax > 0 ? `${fmtVND(sub / pax)}/khách` : ''}</span>}
            </div>
            {catItems.map((it: Item) => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 14, color: '#3a4650' }}>
                <span>• {it.name}{it.note ? <span style={{ color: '#9aa2aa' }}> — {it.note}</span> : null}</span>
                {(it.foc || !pkg) && (
                  <span style={{ color: it.foc ? '#27ae60' : TEAL, fontWeight: it.foc ? 700 : 400, whiteSpace: 'nowrap', paddingLeft: 10 }}>
                    {it.foc ? 'FOC - Miễn phí' : fmtVND(calcVND(it, rates, pax))}
                  </span>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {/* Supplements (package mode) */}
      {addOns.length > 0 && (
        <>
          <div style={{ color: TEAL, fontWeight: 800, fontSize: 14, borderBottom: `2px solid ${TEAL}`, paddingBottom: 4, margin: '14px 0 8px' }}>
            ➕ PHỤ THU / GIÁ KHÁC · SUPPLEMENTS
          </div>
          {addOns.map((l) => (
            <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 14, color: '#3a4650' }}>
              <span>{l.label} <span style={{ color: '#9aa2aa', fontSize: 12 }}>({l.detail})</span></span>
              <span style={{ color: TEAL, fontWeight: 700, whiteSpace: 'nowrap', paddingLeft: 10 }}>{fmtVND(l.resolved)}</span>
            </div>
          ))}
        </>
      )}

      {/* Optional add-ons (not in total) */}
      {optItems.length > 0 && (
        <>
          <div style={{ color: GOLD, fontWeight: 800, fontSize: 14, borderBottom: `2px solid ${GOLD}`, paddingBottom: 4, margin: '14px 0 8px' }}>
            ➕ CHI PHÍ TUỲ CHỌN / OPTIONAL (chưa gồm trong giá)
          </div>
          {optItems.map((o, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 14, color: '#3a4650' }}>
              <span>• {o.name}</span>
              <span style={{ color: '#c2410c', whiteSpace: 'nowrap', paddingLeft: 10 }}>{fmtVND(o.vnd)}</span>
            </div>
          ))}
        </>
      )}

      {/* Inclusions / exclusions */}
      {inclusions.length > 0 && (
        <Section title="✅ GIÁ BAO GỒM / INCLUDED" color={TEAL} lines={inclusions} />
      )}
      {exclusions.length > 0 && (
        <Section title="🚫 KHÔNG BAO GỒM / EXCLUDED" color="#dc3250" lines={exclusions} />
      )}

      {/* Payments */}
      {payments.length > 0 && (
        <>
          <div style={{ color: TEAL, fontWeight: 800, fontSize: 14, borderBottom: `2px solid ${TEAL}`, paddingBottom: 4, margin: '14px 0 8px' }}>
            🧾 THÔNG TIN THANH TOÁN / PAYMENT TERMS
          </div>
          {payments.map((p) => (
            <div key={p.id} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: DARK }}>
                <span>{p.label}</span>
                {p.amount ? <span style={{ color: TEAL }}>{fmtVND(p.amount)}</span> : null}
              </div>
              {p.note.trim() && <div style={{ paddingLeft: 14, color: '#7a828a', fontSize: 12 }}>{p.note}</div>}
            </div>
          ))}
        </>
      )}

      {/* Cancellation policy */}
      {cancels.length > 0 && (
        <>
          <div style={{ color: '#dc3250', fontWeight: 800, fontSize: 14, borderBottom: '2px solid #dc3250', paddingBottom: 4, margin: '14px 0 8px' }}>
            🚷 CHÍNH SÁCH HUỶ TOUR / CANCELLATION POLICY
          </div>
          {cancels.map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 14, color: '#3a4650' }}>
              <span>• {c.when}</span>
              <span style={{ color: '#dc3250', fontWeight: 700, whiteSpace: 'nowrap', paddingLeft: 10 }}>Phạt {c.penalty}%</span>
            </div>
          ))}
        </>
      )}

      {/* FX rate stamp + variation clause (chỉ khi có hạng mục ngoại tệ) */}
      {fxUsed.length > 0 && (
        <div style={{ marginTop: 14, padding: '10px 12px', background: '#f4faf8', border: '1px solid #d7e8e4', borderRadius: 6, fontSize: 11.5, color: '#3a4650' }}>
          <div style={{ fontWeight: 700, color: DARK, marginBottom: 2 }}>
            💱 Tỷ giá áp dụng{draft.rateDate ? ` (ngày ${fmtDateVN(draft.rateDate)})` : ''}:{' '}
            {fxUsed.map((c) => `1 ${c} = ${fmtVND(rates[c] ?? 0)}`).join(' · ')}
          </div>
          <div style={{ color: '#7a828a' }}>
            Giá được tính theo tỷ giá tại thời điểm báo giá; có thể điều chỉnh nếu tỷ giá biến động đáng kể tại thời điểm Quý khách xác nhận.
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, paddingTop: 8, borderTop: '1px dashed #cfd6da', fontSize: 11, color: '#9aa2aa', textAlign: 'center' }}>
        Báo giá có hiệu lực đến hết ngày {fmtDateVN(validUntil)} · Phụ trách: {savedBy.name} ({savedBy.role})
        {savedBy.phone ? ` · ${savedBy.phone}` : ''}{savedBy.email ? ` · ${savedBy.email}` : ''}
        {' · '}{new Date().toLocaleDateString('vi-VN')}
      </div>
    </div>
  );
});
QuotePrintable.displayName = 'QuotePrintable';

function Section({ title, color, lines }: { title: string; color: string; lines: string[] }) {
  return (
    <>
      <div style={{ color, fontWeight: 800, fontSize: 14, borderBottom: `2px solid ${color}`, paddingBottom: 4, margin: '14px 0 8px' }}>
        {title}
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, color: '#3a4650', marginBottom: 3 }}>
          <span style={{ color, fontWeight: 800 }}>•</span>
          <span>{l}</span>
        </div>
      ))}
    </>
  );
}
