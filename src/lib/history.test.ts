import { describe, it, expect } from 'vitest';
import {
  initHistory, pushHistory, undoHistory, redoHistory, canUndo, canRedo, MAX_HISTORY,
} from './history';

describe('history core', () => {
  it('push records previous value into past (non-coalesced)', () => {
    let h = initHistory('a');
    h = pushHistory(h, 'b', 1000);
    h = pushHistory(h, 'c', 2000); // > COALESCE after 1000
    expect(h.present).toBe('c');
    expect(h.past).toEqual(['a', 'b']);
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
  });

  it('coalesces rapid edits into one step', () => {
    let h = initHistory('a');
    h = pushHistory(h, 'b', 1000);
    h = pushHistory(h, 'bb', 1100);  // within 500ms → coalesce
    h = pushHistory(h, 'bbb', 1200); // coalesce
    expect(h.present).toBe('bbb');
    expect(h.past).toEqual(['a']); // only the pre-burst value
  });

  it('undo/redo move between stacks', () => {
    let h = initHistory(1);
    h = pushHistory(h, 2, 1000);
    h = pushHistory(h, 3, 2000);
    h = undoHistory(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(true);
    h = undoHistory(h);
    expect(h.present).toBe(1);
    h = redoHistory(h);
    expect(h.present).toBe(2);
  });

  it('new push after undo clears the redo future', () => {
    let h = initHistory('a');
    h = pushHistory(h, 'b', 1000);
    h = undoHistory(h);          // present a, future [b]
    h = pushHistory(h, 'c', 2000);
    expect(h.present).toBe('c');
    expect(h.future).toEqual([]);
    expect(canRedo(h)).toBe(false);
  });

  it('caps past at MAX_HISTORY', () => {
    let h = initHistory(0);
    for (let i = 1; i <= MAX_HISTORY + 10; i++) h = pushHistory(h, i, i * 1000);
    expect(h.past.length).toBe(MAX_HISTORY);
  });

  it('ignores no-op push of the same value', () => {
    let h = initHistory('x');
    h = pushHistory(h, 'x', 1000);
    expect(h.past).toEqual([]);
  });
});
