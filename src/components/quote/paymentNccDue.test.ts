import { describe, it, expect } from 'vitest';
import { computeNccDue } from './paymentUtils';
import type { PaymentItem, PaymentRecord } from '@/types';

const item = (key: string, name: string, tracked = true): PaymentItem => ({
  key, catId: 'hotel', catLabel: 'Khách sạn', catIcon: '🏨', catColor: '#000',
  name, sourceAmount: 0, amount: 0, tracked, custom: false, isOverridden: false,
});

describe('computeNccDue', () => {
  it('chỉ lấy đợt CHƯA trả & CÓ hạn, kèm NCC + nhãn ghép', () => {
    const items = [item('a', 'Khách sạn 4★')];
    const payments: Record<string, PaymentRecord> = {
      a: {
        supplier: 'KS Mường Thanh',
        installments: [
          { label: 'Đợt 1', amount: 1000, status: 'paid', paidDate: '2026-06-01', dueDate: '2026-06-01' },
          { label: 'Đợt 2', amount: 2000, status: 'unpaid', paidDate: '', dueDate: '2026-06-25' },
          { label: 'Đợt 3', amount: 500, status: 'unpaid', paidDate: '' }, // không có hạn → bỏ
        ],
      },
    };
    const due = computeNccDue(items, payments);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ supplier: 'KS Mường Thanh', label: 'Khách sạn 4★ · Đợt 2', amount: 2000, dueDate: '2026-06-25' });
  });

  it('bỏ qua mục không theo dõi (untracked) và sắp xếp theo hạn tăng dần', () => {
    const items = [item('a', 'Xe'), item('b', 'Vé', false)];
    const payments: Record<string, PaymentRecord> = {
      a: { installments: [
        { label: 'Cuối', amount: 3, status: 'unpaid', paidDate: '', dueDate: '2026-07-10' },
        { label: 'Cọc', amount: 1, status: 'unpaid', paidDate: '', dueDate: '2026-06-20' },
      ] },
      b: { installments: [{ label: 'X', amount: 9, status: 'unpaid', paidDate: '', dueDate: '2026-06-01' }] },
    };
    const due = computeNccDue(items, payments);
    expect(due.map((d) => d.dueDate)).toEqual(['2026-06-20', '2026-07-10']);
  });
});
