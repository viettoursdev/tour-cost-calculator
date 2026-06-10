import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, applyPath } from './util';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once after the wait period', () => {
    const spy = vi.fn();
    const d = debounce(spy, 100);
    d('a');
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('a');
  });

  it('uses the latest args when called rapidly', () => {
    const spy = vi.fn();
    const d = debounce(spy, 100);
    d('a');
    d('b');
    d('c');
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('c');
  });

  it('resets the timer on each call', () => {
    const spy = vi.fn();
    const d = debounce(spy, 100);
    d('a');
    vi.advanceTimersByTime(50);
    d('b');
    vi.advanceTimersByTime(50);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('b');
  });
});

describe('applyPath', () => {
  it('sets a top-level key', () => {
    const result = applyPath({ a: 1 }, 'a', 2);
    expect(result).toEqual({ a: 2 });
  });

  it('sets a nested key', () => {
    const result = applyPath({ a: { b: { c: 1 } } }, 'a.b.c', 99);
    expect(result).toEqual({ a: { b: { c: 99 } } });
  });

  it('creates intermediate objects when missing', () => {
    const result = applyPath({}, 'a.b.c', 1);
    expect(result).toEqual({ a: { b: { c: 1 } } });
  });

  it('does not mutate the input', () => {
    const input = { a: { b: 1 } };
    applyPath(input, 'a.b', 99);
    expect(input).toEqual({ a: { b: 1 } });
  });

  it('overwrites a non-object intermediate', () => {
    const result = applyPath({ a: 5 }, 'a.b', 1);
    expect(result).toEqual({ a: { b: 1 } });
  });
});
