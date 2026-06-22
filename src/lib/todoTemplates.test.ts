import { describe, it, expect } from 'vitest';
import { QUOTE_WON_TASKS, quoteTaskDue } from './todoTemplates';

describe('quoteTaskDue', () => {
  const now = new Date('2026-06-22T08:00:00.000Z').getTime();
  const tpl = QUOTE_WON_TASKS[0]; // offsetFromDepart -21, offsetFromNow 2

  it('có ngày khởi hành → tính lệch theo khởi hành (17:00)', () => {
    const due = new Date(quoteTaskDue(tpl, '2026-08-01', now));
    // 2026-08-01 - 21 ngày = 2026-07-11
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(6); // tháng 7 (0-based)
    expect(due.getDate()).toBe(11);
  });

  it('không có ngày khởi hành → tính lệch theo hôm nay', () => {
    const due = new Date(quoteTaskDue(tpl, undefined, now)).getTime();
    expect(due).toBe(now + 2 * 86400000);
  });
});
