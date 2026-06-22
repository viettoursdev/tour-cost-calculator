import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));
import { parseSchedule, genToDays } from './aiSchedule';

describe('parseSchedule', () => {
  it('tách JSON dạng {days:[...]} kể cả có fence/chữ quanh', () => {
    const txt = 'Đây là lịch trình:\n```json\n{"days":[{"title":"HN→ĐN","activities":[{"time":"08:00","text":"Bay"},{"text":"Ăn trưa"}]}]}\n```';
    const g = parseSchedule(txt);
    expect(g).toHaveLength(1);
    expect(g![0].title).toBe('HN→ĐN');
    expect(g![0].activities).toEqual([{ time: '08:00', text: 'Bay' }, { time: undefined, text: 'Ăn trưa' }]);
  });
  it('chấp nhận mảng trực tiếp & activities dạng chuỗi', () => {
    const g = parseSchedule('[{"title":"Ngày 1","activities":["Tham quan","Mua sắm"]}]');
    expect(g![0].activities.map((a) => a.text)).toEqual(['Tham quan', 'Mua sắm']);
  });
  it('trả null nếu không phải JSON hợp lệ', () => {
    expect(parseSchedule('không có gì')).toBeNull();
  });
});

describe('genToDays', () => {
  it('chuyển khung → Day có id, đánh số từ startNum', () => {
    const days = genToDays([{ title: 'A', activities: [{ text: 'x' }] }, { title: 'B', activities: [] }], 3);
    expect(days[0].dayNum).toBe(3);
    expect(days[1].dayNum).toBe(4);
    expect(days[0].title).toBe('A');
    expect(days[0].segments[0].activities[0].text).toBe('x');
    expect(days[1].segments[0].activities).toHaveLength(1); // ngày rỗng vẫn có 1 activity trống
    expect(days[0].id).not.toBe(days[1].id);
  });
});
