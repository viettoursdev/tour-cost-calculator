import { describe, it, expect } from 'vitest';
import { computeSettlement } from './paymentUtils';
import { getCATS } from './constants';
import type { CategoryId, CustomCostItem, Item, PaymentRecord, QuoteDraft } from '@/types';

function item(over: Partial<Item> = {}): Item {
  return {
    id: 1, name: 'x', note: '', cur: 'VND', price: 100, times: 1,
    qtyMode: 'per_group', customQty: 1, unit: '/người', enabled: true, foc: false, ...over,
  };
}

function draft(over: Partial<QuoteDraft> = {}): QuoteDraft {
  const catEnabled = Object.fromEntries(getCATS('domestic').map((c) => [c.id, false])) as Record<CategoryId, boolean>;
  return {
    template: 'domestic',
    info: { name: 'Tour test', dest: '', days: 1, nights: 0, startDate: null },
    pax: 10, rates: {}, margin: 0, vat: 0, svcBasis: 0, rounding: 1,
    items: {}, catEnabled, currentQuoteId: null, ...over,
  };
}

describe('computeSettlement', () => {
  const cats = getCATS('domestic');

  it('đối chiếu dự toán ↔ thực chi: override, đợt đã trả, chi phí phát sinh', () => {
    const d = draft({
      catEnabled: { ...Object.fromEntries(cats.map((c) => [c.id, false])), hotel: true, transport: true } as Record<CategoryId, boolean>,
      items: {
        hotel: [item({ id: 1, name: 'KS', qtyMode: 'per_pax', price: 100 })],   // 100×10 = 1000
        transport: [item({ id: 1, name: 'Xe', qtyMode: 'per_group', price: 500 })], // 500
      },
    });
    const payments: Record<string, PaymentRecord> = {
      hotel_1: { customAmount: 1200, installments: [{ label: 'Cọc', amount: 500, status: 'paid', paidDate: '2026-06-01' }] },
      transport_1: { installments: [{ label: 'Toàn bộ', amount: 500, status: 'paid', paidDate: '2026-06-02' }] },
    };
    const customItems: CustomCostItem[] = [
      { key: 'c1', catId: 'hotel', catLabel: 'Khách sạn', catIcon: '🏨', catColor: '#f5a623', name: 'Phụ thu', amount: 300 },
    ];

    const s = computeSettlement(d, cats, payments, customItems);

    expect(s.budgetCost).toBe(1500);          // dự toán (không gồm khoản tự tạo)
    expect(s.actualCost).toBe(2000);          // 1200 + 500 + 300 phát sinh
    expect(s.paidCost).toBe(1000);            // 500 + 500
    expect(s.costVariance).toBe(500);         // bội chi
    expect(s.netRevenue).toBe(1500);          // margin/vat = 0
    expect(s.plannedProfit).toBe(0);
    expect(s.actualProfit).toBe(-500);

    const hotel = s.byCat.find((c) => c.catId === 'hotel')!;
    expect(hotel).toMatchObject({ budget: 1000, actual: 1500, paid: 500, delta: 500 });
    const transport = s.byCat.find((c) => c.catId === 'transport')!;
    expect(transport).toMatchObject({ budget: 500, actual: 500, paid: 500, delta: 0 });
  });

  it('biên lợi nhuận thật phản ánh margin + VAT từ báo giá', () => {
    const d = draft({
      margin: 25, vat: 8, pax: 1,
      catEnabled: { ...Object.fromEntries(cats.map((c) => [c.id, false])), hotel: true } as Record<CategoryId, boolean>,
      items: { hotel: [item({ id: 1, name: 'KS', qtyMode: 'per_group', price: 1000 })] }, // budget 1000
    });
    const s = computeSettlement(d, cats, {}, []);
    // Không có payment → thực chi mặc định = dự toán → lãi thật = lãi dự kiến.
    expect(s.actualCost).toBe(1000);
    expect(s.budgetCost).toBe(1000);
    expect(s.actualMarginPct).toBeCloseTo(s.plannedMarginPct, 6);
    expect(s.actualProfit).toBe(s.plannedProfit);
    expect(s.netRevenue).toBe(s.grandTotal - s.totalVAT);
  });

  it('doanh thu thực (override) đổi biên lợi cột THỰC, giữ nguyên cột dự kiến', () => {
    const d = draft({
      pax: 1,
      catEnabled: { ...Object.fromEntries(cats.map((c) => [c.id, false])), hotel: true } as Record<CategoryId, boolean>,
      items: { hotel: [item({ id: 1, name: 'KS', qtyMode: 'per_group', price: 1000 })] }, // budget 1000, netRevenue 1000
    });
    // Không nhập → actualRevenue = netRevenue
    const base = computeSettlement(d, cats, {}, []);
    expect(base.actualRevenue).toBe(base.netRevenue);
    expect(base.revenueOverridden).toBe(false);

    // Nhập doanh thu thực 1500 → lãi thật = 1500 − 1000 = 500; dự kiến vẫn theo netRevenue.
    const over = computeSettlement(d, cats, {}, [], { actualRevenue: 1500 });
    expect(over.revenueOverridden).toBe(true);
    expect(over.actualRevenue).toBe(1500);
    expect(over.actualProfit).toBe(500);
    expect(over.plannedProfit).toBe(base.plannedProfit); // không đổi
    expect(over.actualMarginPct).toBeCloseTo((500 / 1500) * 100, 6);
  });

  it('không có dữ liệu → byCat rỗng, biên lợi 0', () => {
    const s = computeSettlement(draft(), cats, {}, []);
    expect(s.byCat).toHaveLength(0);
    expect(s.budgetCost).toBe(0);
    expect(s.actualMarginPct).toBe(0);
  });
});
