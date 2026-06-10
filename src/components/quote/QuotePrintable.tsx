/**
 * Customer-facing HTML rendering of the quote, used as the capture source for
 * the image-based PDF export (exportPDFImage). Rendered off-screen.
 */
import { forwardRef } from 'react';
import { calcVND, computeTotals, fmtVND } from './calc';
import { getCATS } from './constants';
import { VTE_LOGO } from '@/lib/exports/vteLogo';
import type { Item, QuoteDraft } from '@/types';

const TEAL = '#14a08c';
const DARK = '#0f3a4a';
const GOLD = '#f5a623';

type Props = {
  draft: QuoteDraft;
  savedBy: { name: string; role: string; email?: string; phone?: string };
};

export const QuotePrintable = forwardRef<HTMLDivElement, Props>(({ draft, savedBy }, ref) => {
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
            <div style={{ color: '#7a828a', fontSize: 11 }}>Hotline 1900 1839 · www.viettours.com.vn</div>
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

      {/* Price box */}
      <div style={{ background: '#fff8e1', border: `1px solid ${GOLD}`, borderRadius: 8, padding: '12px 20px', textAlign: 'center', marginBottom: 18 }}>
        <div style={{ color: TEAL, fontWeight: 700, fontSize: 12 }}>GIÁ TRỌN GÓI / KHÁCH · PACKAGE PRICE / PAX</div>
        <div style={{ color: '#dc3250', fontWeight: 900, fontSize: 30 }}>{fmtVND(roundedPPax)}</div>
        <div style={{ color: DARK, fontSize: 12 }}>Tổng đoàn {pax} khách: {fmtVND(roundedPPax * pax)}</div>
      </div>

      {/* Services */}
      <div style={{ color: TEAL, fontWeight: 800, fontSize: 14, borderBottom: `2px solid ${TEAL}`, paddingBottom: 4, marginBottom: 8 }}>
        DỊCH VỤ BAO GỒM / INCLUDED SERVICES
      </div>
      {activeCATS.map((cat) => {
        const catItems = (items[cat.id as keyof typeof items] ?? [])
          .filter((i: Item) => i.name && (calcVND(i, rates, pax) > 0 || i.foc === true));
        if (!catEnabled[cat.id as keyof typeof catEnabled] || catItems.length === 0) return null;
        const sub = catItems.reduce((s: number, i: Item) => s + calcVND(i, rates, pax), 0);
        return (
          <div key={cat.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: DARK }}>
              <span>{cat.icon} {cat.label}</span>
              <span style={{ color: TEAL }}>{pax > 0 ? `${fmtVND(sub / pax)}/khách` : ''}</span>
            </div>
            {catItems.map((it: Item) => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 14, color: '#3a4650' }}>
                <span>• {it.name}{it.note ? <span style={{ color: '#9aa2aa' }}> — {it.note}</span> : null}</span>
                <span style={{ color: it.foc ? '#27ae60' : TEAL, fontWeight: it.foc ? 700 : 400, whiteSpace: 'nowrap', paddingLeft: 10 }}>
                  {it.foc ? 'FOC - Miễn phí' : fmtVND(calcVND(it, rates, pax))}
                </span>
              </div>
            ))}
          </div>
        );
      })}

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

      <div style={{ marginTop: 18, paddingTop: 8, borderTop: '1px dashed #cfd6da', fontSize: 11, color: '#9aa2aa', textAlign: 'center' }}>
        Báo giá có hiệu lực 07 ngày · Phụ trách: {savedBy.name} ({savedBy.role})
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
