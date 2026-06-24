import { describe, it, expect } from 'vitest';
import { buildAllItems, computePaymentTotals } from './paymentUtils';
import type { CustomCostItem, PaymentItem, PaymentRecord } from '@/types';

const rates = { USD: 25000, EUR: 27000 };

function src(key: string, name: string, vnd: number): PaymentItem {
  return {
    key, catId: 'transport' as never, catLabel: 'Vận chuyển', catIcon: '🚌', catColor: '#000',
    name, sourceAmount: vnd, amount: vnd, tracked: true, custom: false, isOverridden: false,
  };
}

describe('buildAllItems — quy đổi ngoại tệ theo hạng mục', () => {
  it('hạng mục nguồn nhập USD → amount quy về VND, giữ foreignAmount', () => {
    const payments: Record<string, PaymentRecord> = {
      dmc_1: { cur: 'USD', customAmount: 1000 },
    };
    const [it] = buildAllItems([src('dmc_1', 'DMC Thái', 30_000_000)], payments, [], rates);
    expect(it.cur).toBe('USD');
    expect(it.foreignAmount).toBe(1000);
    expect(it.amount).toBe(25_000_000); // 1000 × 25000
    expect(it.isOverridden).toBe(true);
  });

  it('thiếu tỷ giá → giữ nguyên số đã nhập (coi như VND), không nhân bừa', () => {
    const payments: Record<string, PaymentRecord> = {
      dmc_1: { cur: 'GBP', customAmount: 500 },
    };
    const [it] = buildAllItems([src('dmc_1', 'DMC Anh', 10_000_000)], payments, [], rates);
    expect(it.amount).toBe(500);
  });

  it('không có cur → giữ logic VND như cũ', () => {
    const payments: Record<string, PaymentRecord> = {
      dmc_1: { customAmount: 12_000_000 },
    };
    const [it] = buildAllItems([src('dmc_1', 'DMC', 10_000_000)], payments, [], rates);
    expect(it.cur).toBeUndefined();
    expect(it.amount).toBe(12_000_000);
    expect(it.isOverridden).toBe(true);
  });

  it('khoản tự tạo bằng EUR → amount = số EUR × tỷ giá', () => {
    const custom: CustomCostItem[] = [{
      key: 'c1', catId: 'other' as never, catLabel: 'Khác', catIcon: '➕', catColor: '#000',
      name: 'Phí lẻ', amount: 200, cur: 'EUR',
    }];
    const [it] = buildAllItems([], {}, custom, rates);
    expect(it.cur).toBe('EUR');
    expect(it.foreignAmount).toBe(200);
    expect(it.amount).toBe(5_400_000); // 200 × 27000
  });
});

describe('computePaymentTotals — lợi nhuận = báo giá − phải thanh toán', () => {
  it('bù trừ chéo: khoản vượt được bù bằng khoản tiết kiệm → lợi nhuận = tổng', () => {
    // A: báo giá 10tr, trả thực 8tr (tiết kiệm +2tr)
    // B: báo giá 5tr, trả thực 6tr (vượt -1tr)
    const items = buildAllItems(
      [src('a', 'A', 10_000_000), src('b', 'B', 5_000_000)],
      { a: { customAmount: 8_000_000 }, b: { customAmount: 6_000_000 } },
      [],
      rates,
    );
    const t = computePaymentTotals(items, { a: { customAmount: 8_000_000 }, b: { customAmount: 6_000_000 } });
    expect(t.totalBudget).toBe(15_000_000);
    expect(t.totalCost).toBe(14_000_000); // 8 + 6
    expect(t.profit).toBe(1_000_000);     // 2tr tiết kiệm − 1tr vượt
  });

  it('khoản tự tạo (phát sinh) tính báo giá = 0 → giảm lợi nhuận', () => {
    const custom: CustomCostItem[] = [{
      key: 'c1', catId: 'other' as never, catLabel: 'Khác', catIcon: '➕', catColor: '#000',
      name: 'Phát sinh', amount: 3_000_000,
    }];
    const items = buildAllItems([src('a', 'A', 10_000_000)], {}, custom, rates);
    const t = computePaymentTotals(items, {});
    expect(t.totalBudget).toBe(10_000_000); // chỉ A có báo giá
    expect(t.totalCost).toBe(13_000_000);   // A 10tr + phát sinh 3tr
    expect(t.profit).toBe(-3_000_000);      // vượt báo giá
  });

  it('mục chưa theo dõi không tính vào tổng', () => {
    const items = buildAllItems(
      [src('a', 'A', 10_000_000), src('b', 'B', 5_000_000)],
      { b: { tracked: false } },
      [],
      rates,
    );
    const t = computePaymentTotals(items, { b: { tracked: false } });
    expect(t.totalBudget).toBe(10_000_000);
    expect(t.totalCost).toBe(10_000_000);
    expect(t.profit).toBe(0);
  });
});
