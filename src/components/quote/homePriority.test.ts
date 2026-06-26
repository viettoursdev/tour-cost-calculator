import { describe, it, expect } from 'vitest';
import { severityOf, rankPriority, type PriSeverity } from './homePriority';

const NOW = 1_000_000_000_000;

describe('severityOf', () => {
  it('quá hạn / khẩn (≤24h) / sắp tới / không mốc', () => {
    expect(severityOf(NOW - 1, NOW)).toBe('overdue');
    expect(severityOf(NOW + 3600_000, NOW)).toBe('urgent');     // +1h
    expect(severityOf(NOW + 86400000, NOW)).toBe('urgent');     // đúng 24h
    expect(severityOf(NOW + 86400000 + 1, NOW)).toBe('soon');   // >24h
    expect(severityOf(null, NOW)).toBe('soon');
  });
});

describe('rankPriority', () => {
  const mk = (id: string, severity: PriSeverity, dueTs: number | null) => ({ id, severity, dueTs });

  it('xếp theo mức khẩn rồi theo mốc thời gian; null xếp cuối', () => {
    const out = rankPriority([
      mk('soon-late', 'soon', NOW + 5),
      mk('overdue-2', 'overdue', NOW - 10),
      mk('urgent', 'urgent', NOW + 100),
      mk('overdue-1', 'overdue', NOW - 100),
      mk('soon-null', 'soon', null),
    ]);
    expect(out.map((x) => x.id)).toEqual(['overdue-1', 'overdue-2', 'urgent', 'soon-late', 'soon-null']);
  });

  it('không đổi mảng gốc (trả bản sao)', () => {
    const src = [mk('a', 'soon', 2), mk('b', 'overdue', 1)];
    const out = rankPriority(src);
    expect(src.map((x) => x.id)).toEqual(['a', 'b']);
    expect(out[0].id).toBe('b');
  });
});
