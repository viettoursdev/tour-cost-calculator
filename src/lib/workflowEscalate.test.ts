import { describe, it, expect } from 'vitest';
import { escalationLevel, nudgeBucket } from './workflowEscalate';

describe('escalationLevel', () => {
  it('0 dưới ngưỡng · 1 tại/trên L1 · 2 tại/trên L2', () => {
    expect(escalationLevel(2, 3, 7)).toBe(0);
    expect(escalationLevel(3, 3, 7)).toBe(1);
    expect(escalationLevel(6, 3, 7)).toBe(1);
    expect(escalationLevel(7, 3, 7)).toBe(2);
    expect(escalationLevel(20, 3, 7)).toBe(2);
  });
});

describe('nudgeBucket', () => {
  it('đổi mỗi everyDays ngày → nhắc lại định kỳ', () => {
    expect(nudgeBucket(0, 3)).toBe(0);
    expect(nudgeBucket(2, 3)).toBe(0);
    expect(nudgeBucket(3, 3)).toBe(1);
    expect(nudgeBucket(5, 3)).toBe(1);
    expect(nudgeBucket(6, 3)).toBe(2);
  });
  it('an toàn với everyDays=0 và số âm', () => {
    expect(nudgeBucket(5, 0)).toBe(5);
    expect(nudgeBucket(-4, 3)).toBe(0);
  });
});
