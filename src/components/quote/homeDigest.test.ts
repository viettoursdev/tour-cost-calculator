import { describe, it, expect } from 'vitest';
import { buildDigest, type DigestCounts } from './homeDigest';

const zero: DigestCounts = { overdue: 0, deadlines: 0, departing: 0, nccDue: 0, docs: 0, leaves: 0, followups: 0 };

describe('buildDigest', () => {
  it('không có gì → câu chúc', () => {
    expect(buildDigest(zero)).toContain('chưa có việc nào');
  });

  it('1 mục → câu đơn', () => {
    expect(buildDigest({ ...zero, overdue: 3 })).toBe('Hôm nay bạn có 3 việc quá hạn.');
  });

  it('nhiều mục → nối bằng dấu phẩy và "và"', () => {
    const s = buildDigest({ ...zero, overdue: 3, departing: 2, leaves: 1 });
    expect(s).toBe('Hôm nay bạn có 3 việc quá hạn, 2 tour sắp khởi hành và 1 đơn nghỉ phép chờ duyệt.');
  });

  it('2 mục → "X và Y"', () => {
    expect(buildDigest({ ...zero, deadlines: 1, docs: 2 }))
      .toBe('Hôm nay bạn có 1 deadline sắp tới và 2 giấy tờ khách sắp hết hạn.');
  });
});
