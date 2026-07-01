import { describe, it, expect } from 'vitest';
import { slaFromIndex, cycleStats } from './workflowSLA';
import type { CloudQuoteEntry, WorkflowStep } from '@/types';

const entry = (o: Partial<CloudQuoteEntry>): CloudQuoteEntry => ({
  id: 1, cloudId: 'c', quoteCode: '', name: 'Tour', template: 'intl', pax: 1, totalCost: 0, ...o,
}) as CloudQuoteEntry;

describe('slaFromIndex', () => {
  const today = '2026-06-15';
  const entries = [
    entry({ cloudId: 'a', workflowSummary: { current: 'Xác nhận dịch vụ', donePct: 40, total: 10, overdue: 2 },
      workflowDue: [{ label: 'Xác nhận dịch vụ', dueDate: '2026-06-01' }, { label: 'Ký kết hợp đồng', dueDate: '2026-07-01' }] }),
    entry({ cloudId: 'b', workflowSummary: { current: 'Xác nhận dịch vụ', donePct: 20, total: 10, overdue: 0 },
      workflowDue: [{ label: 'Xác nhận dịch vụ', dueDate: '2026-06-10' }] }),
    entry({ cloudId: 'c', workflowSummary: { current: 'Ký kết hợp đồng', donePct: 100, total: 10, overdue: 0 } }), // đã xong → không "running"
    entry({ cloudId: 'd' }), // không có workflow → bỏ
  ];

  it('counts totals correctly (chỉ tính báo giá có workflow)', () => {
    const r = slaFromIndex(entries, today);
    expect(r.totals.withWf).toBe(3);
    expect(r.totals.running).toBe(2);      // a, b
    expect(r.totals.overdue).toBe(1);      // a
    expect(r.totals.avgDonePct).toBe(53);  // (40+20+100)/3 = 53.3 → 53
  });

  it('ranks bottleneck by stuck count then overdue', () => {
    const r = slaFromIndex(entries, today);
    expect(r.bottlenecks[0].label).toBe('Xác nhận dịch vụ');
    expect(r.bottlenecks[0].stuck).toBe(2);        // a, b đang ở bước này
    expect(r.bottlenecks[0].stuckOverdue).toBe(1); // chỉ a có bước quá hạn
    expect(r.bottlenecks[0].overdueDue).toBe(2);   // a(06-01) + b(06-10) đều < today
  });

  it('không đếm bước có hạn tương lai là quá hạn', () => {
    const r = slaFromIndex(entries, today);
    // 'Ký kết hợp đồng' chỉ có 1 hạn ở tương lai (2026-07-01) và không tour nào
    // đang kẹt ở đó → KHÔNG xuất hiện trong bottlenecks (nếu bị đếm quá hạn sẽ có).
    expect(r.bottlenecks.find((b) => b.label === 'Ký kết hợp đồng')).toBeUndefined();
  });

  it('empty → zeros', () => {
    const r = slaFromIndex([], today);
    expect(r.totals).toEqual({ withWf: 0, running: 0, overdue: 0, avgDonePct: 0 });
    expect(r.bottlenecks).toEqual([]);
  });
});

describe('cycleStats', () => {
  const stepWithLog = (label: string, doingAt: string, doneAt: string, dueDate?: string): WorkflowStep => ({
    id: label, label, status: 'done', dueDate, doneDate: doneAt.slice(0, 10),
    log: [
      { at: doingAt, by: 'x', action: '→ Đang làm' },
      { at: doneAt, by: 'x', action: '→ Hoàn tất' },
    ],
  });

  it('tính thời gian xử lý TB & median theo nhãn, sắp chậm nhất lên đầu', () => {
    const wfs: WorkflowStep[][] = [
      [stepWithLog('A', '2026-01-01T00:00:00Z', '2026-01-05T00:00:00Z')], // 4 ngày
      [stepWithLog('A', '2026-02-01T00:00:00Z', '2026-02-03T00:00:00Z')], // 2 ngày
      [stepWithLog('B', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')], // 1 ngày
    ];
    const r = cycleStats(wfs);
    expect(r[0].label).toBe('A');
    expect(r[0].samples).toBe(2);
    expect(r[0].avgDays).toBe(3);     // (4+2)/2
    expect(r[0].medianDays).toBe(3);  // (2+4)/2
    expect(r[1].label).toBe('B');
    expect(r[1].avgDays).toBe(1);
  });

  it('tỷ lệ đúng hạn = done không trễ / done có hạn', () => {
    const wfs: WorkflowStep[][] = [
      [stepWithLog('A', '2026-01-01T00:00:00Z', '2026-01-05T00:00:00Z', '2026-01-10')], // đúng hạn (05<=10)
      [stepWithLog('A', '2026-01-01T00:00:00Z', '2026-01-15T00:00:00Z', '2026-01-10')], // trễ (15>10)
    ];
    const r = cycleStats(wfs);
    expect(r[0].doneWithDue).toBe(2);
    expect(r[0].lateDone).toBe(1);
    expect(r[0].onTimeRate).toBe(50);
  });

  it('không có mẫu hạn → onTimeRate null', () => {
    const wfs: WorkflowStep[][] = [[stepWithLog('A', '2026-01-01T00:00:00Z', '2026-01-05T00:00:00Z')]];
    expect(cycleStats(wfs)[0].onTimeRate).toBeNull();
  });
});
