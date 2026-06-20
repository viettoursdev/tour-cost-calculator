import { describe, it, expect } from 'vitest';
import { parseInlineRich, splitLines } from './richText';

describe('parseInlineRich', () => {
  it('đậm + nghiêng + thường', () => {
    expect(parseInlineRich('Chùa **Thiếu Lâm** rất *cổ kính* nhé')).toEqual([
      { text: 'Chùa ' },
      { text: 'Thiếu Lâm', bold: true },
      { text: ' rất ' },
      { text: 'cổ kính', italic: true },
      { text: ' nhé' },
    ]);
  });
  it('không có markup → 1 đoạn', () => {
    expect(parseInlineRich('Tham quan tự do')).toEqual([{ text: 'Tham quan tự do' }]);
  });
});

describe('splitLines', () => {
  it('giữ dòng trống', () => {
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b']);
    expect(splitLines(undefined)).toEqual(['']);
  });
});
