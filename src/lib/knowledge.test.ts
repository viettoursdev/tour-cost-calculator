import { describe, expect, it } from 'vitest';
import { chunkText } from './knowledge';

describe('chunkText', () => {
  it('trả mảng rỗng cho nội dung rỗng/khoảng trắng', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('nội dung ngắn → một khối duy nhất', () => {
    const out = chunkText('Khách thiếu sao kê thì bổ túc sổ tiết kiệm.', 50, 10);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('sổ tiết kiệm');
  });

  it('nhiều đoạn vượt ngưỡng → nhiều khối, giữ đủ từ, không vượt maxWords', () => {
    const para = (n: number) => `doan${n} alpha beta gamma`; // 4 từ/đoạn
    const text = [1, 2, 3, 4, 5, 6].map(para).join('\n\n');
    const out = chunkText(text, 10, 2);

    expect(out.length).toBeGreaterThan(1);
    for (const c of out) {
      expect(c.split(/\s+/).length).toBeLessThanOrEqual(10);
    }
    // Mọi đoạn gốc phải xuất hiện ở đâu đó trong các khối.
    const joined = out.join(' ');
    for (const n of [1, 2, 3, 4, 5, 6]) expect(joined).toContain(`doan${n}`);
  });

  it('đoạn đơn quá dài bị cắt thành nhiều khối', () => {
    const words = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const out = chunkText(words, 10, 3);
    expect(out.length).toBeGreaterThan(1);
    expect(out[0]).toContain('w0');
  });
});
