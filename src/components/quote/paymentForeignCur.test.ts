import { describe, it, expect } from 'vitest';
import { buildAllItems } from './paymentUtils';
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
