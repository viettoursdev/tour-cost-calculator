import { describe, it, expect } from 'vitest';
import { findResourceConflicts, assetAllocationsFromLogs, overdueAssetHoldings, type ResourceAllocation, type AssetLogLike } from './resourceConflicts';

const day = (d: number) => Date.parse(`2026-06-${String(d).padStart(2, '0')}T00:00:00Z`);
const iso = (d: number) => `2026-06-${String(d).padStart(2, '0')}T08:00:00Z`;

const alloc = (p: Partial<ResourceAllocation>): ResourceAllocation =>
  ({ resourceId: 'A1', resourceName: 'Loa #1', kind: 'asset', refId: 't1', refLabel: 'Tour 1', start: day(1), end: day(5), ...p });

describe('findResourceConflicts', () => {
  it('hai tour khác nhau giữ cùng tài sản, ngày chồng → 1 conflict', () => {
    const r = findResourceConflicts([
      alloc({ refId: 't1', refLabel: 'Tour 1', start: day(1), end: day(5) }),
      alloc({ refId: 't2', refLabel: 'Tour 2', start: day(3), end: day(8) }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].a.refId).toBe('t1');
    expect(r[0].b.refId).toBe('t2');
    expect(r[0].overlapMs).toBe(day(5) - day(3));
  });

  it('không chồng ngày → không conflict', () => {
    const r = findResourceConflicts([
      alloc({ refId: 't1', start: day(1), end: day(3) }),
      alloc({ refId: 't2', start: day(4), end: day(8) }),
    ]);
    expect(r).toHaveLength(0);
  });

  it('cùng tour (refId) chồng nhau → bỏ qua', () => {
    const r = findResourceConflicts([
      alloc({ refId: 't1', start: day(1), end: day(5) }),
      alloc({ refId: 't1', start: day(2), end: day(6) }),
    ]);
    expect(r).toHaveLength(0);
  });

  it('tài sản khác nhau không lẫn vào nhau', () => {
    const r = findResourceConflicts([
      alloc({ resourceId: 'A1', refId: 't1', start: day(1), end: day(5) }),
      alloc({ resourceId: 'A2', refId: 't2', start: day(2), end: day(6) }),
    ]);
    expect(r).toHaveLength(0);
  });
});

describe('assetAllocationsFromLogs', () => {
  const name = (id: string) => `Asset ${id}`;

  it('checkout→checkin tạo khoảng đúng; bỏ checkout không gắn tour', () => {
    const logs: AssetLogLike[] = [
      { assetId: 'A1', action: 'checkout', occurredAt: iso(1), tourProfileId: 't1', tourCode: 'T1' },
      { assetId: 'A1', action: 'checkin', occurredAt: iso(4) },
      { assetId: 'A1', action: 'checkout', occurredAt: iso(6) }, // không có tour → bỏ
    ];
    const a = assetAllocationsFromLogs(logs, name);
    expect(a).toHaveLength(1);
    expect(a[0].refId).toBe('t1');
    expect(a[0].start).toBe(Date.parse(iso(1)));
    expect(a[0].end).toBe(Date.parse(iso(4)));
  });

  it('checkout mới khi chưa checkin → đóng khoảng cũ tại điểm checkout mới (phát hiện giao tour)', () => {
    const logs: AssetLogLike[] = [
      { assetId: 'A1', action: 'checkout', occurredAt: iso(1), tourProfileId: 't1', tourCode: 'T1' },
      { assetId: 'A1', action: 'checkout', occurredAt: iso(3), tourProfileId: 't2', tourCode: 'T2' },
    ];
    const a = assetAllocationsFromLogs(logs, name, { defaultDurationDays: 5 });
    expect(a).toHaveLength(2);
    expect(a[1].refId).toBe('t2');
    // khoảng t2 còn mở → kéo dài 5 ngày
    expect(a[1].end).toBe(a[1].start + 5 * 86_400_000);
  });

});

describe('overdueAssetHoldings', () => {
  const name = (id: string) => `Asset ${id}`;
  const NOW = Date.parse('2026-06-20T00:00:00Z');

  it('checkout chưa checkin quá hạn → báo quá hạn hoàn trả', () => {
    const logs: AssetLogLike[] = [
      { assetId: 'A1', action: 'checkout', occurredAt: iso(1), tourProfileId: 't1', tourCode: 'T1' },
    ];
    const r = overdueAssetHoldings(logs, name, { now: NOW, graceDays: 7 });
    expect(r).toHaveLength(1);
    expect(r[0].refLabel).toBe('T1');
    expect(r[0].daysHeld).toBeGreaterThanOrEqual(7);
  });

  it('đã checkin → không quá hạn', () => {
    const logs: AssetLogLike[] = [
      { assetId: 'A1', action: 'checkout', occurredAt: iso(1), tourProfileId: 't1' },
      { assetId: 'A1', action: 'checkin', occurredAt: iso(3) },
    ];
    expect(overdueAssetHoldings(logs, name, { now: NOW })).toHaveLength(0);
  });

  it('giữ trong thời gian cho phép → chưa báo', () => {
    const logs: AssetLogLike[] = [
      { assetId: 'A1', action: 'checkout', occurredAt: iso(18), tourProfileId: 't1' },
    ];
    expect(overdueAssetHoldings(logs, name, { now: NOW, graceDays: 7 })).toHaveLength(0);
  });
});
