import { describe, it, expect } from 'vitest';
import { shouldReload } from './chunkReload';

describe('shouldReload', () => {
  it('reload lần đầu (chưa từng reload)', () => {
    expect(shouldReload(0, 100000, 15000)).toBe(true);
  });
  it('không reload nếu vừa reload trong cửa sổ chặn', () => {
    expect(shouldReload(100000, 105000, 15000)).toBe(false);
  });
  it('reload lại khi đã quá cửa sổ chặn', () => {
    expect(shouldReload(100000, 120000, 15000)).toBe(true);
  });
});
