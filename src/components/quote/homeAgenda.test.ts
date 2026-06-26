import { describe, it, expect } from 'vitest';
import { addDays, weekAgenda, weeklyQuoteCounts } from './homeAgenda';

describe('addDays', () => {
  it('cộng/trừ ngày qua biên tháng (UTC)', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('weekAgenda', () => {
  it('7 ô từ hôm nay, đếm việc đúng ngày, đánh dấu hôm nay', () => {
    const a = weekAgenda(
      { departing: ['2026-06-26', '2026-06-28'], deadlines: ['2026-06-26'], followups: ['2026-06-27', '2026-06-27'] },
      '2026-06-26',
    );
    expect(a).toHaveLength(7);
    expect(a[0]).toMatchObject({ date: '2026-06-26', isToday: true, departing: 1, deadlines: 1, followups: 0, total: 2 });
    expect(a[1]).toMatchObject({ date: '2026-06-27', followups: 2, total: 2 });
    expect(a[2]).toMatchObject({ date: '2026-06-28', departing: 1, total: 1 });
    expect(a[0].weekday).toBe('T6'); // 2026-06-26 là thứ Sáu
  });

  it('số ô tùy chỉnh', () => {
    expect(weekAgenda({ departing: [], deadlines: [], followups: [] }, '2026-06-26', 3)).toHaveLength(3);
  });
});

describe('weeklyQuoteCounts', () => {
  const NOW = Date.UTC(2026, 5, 26); // 2026-06-26
  const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();

  it('gom theo tuần, cũ→mới, bỏ ngoài cửa sổ', () => {
    const counts = weeklyQuoteCounts([daysAgo(0), daysAgo(3), daysAgo(8), daysAgo(100)], 4, NOW);
    // tuần này (age 0): 2 (0 & 3 ngày); tuần trước (age 1): 1 (8 ngày); 100 ngày bị bỏ
    expect(counts).toHaveLength(4);
    expect(counts[3]).toBe(2);
    expect(counts[2]).toBe(1);
    expect(counts[0]).toBe(0);
  });
});
