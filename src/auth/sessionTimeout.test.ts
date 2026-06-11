import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  IDLE_TIMEOUT_MS,
  TOUCH_THROTTLE_MS,
  getSignInMethod,
  setSignInMethod,
  clearSessionTracking,
  readLastActive,
  touchLastActive,
  isExpired,
} from './sessionTimeout';

const U = 'alice';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-11T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sign-in method tracking', () => {
  it('returns null when no method is stored', () => {
    expect(getSignInMethod(U)).toBeNull();
  });

  it('round-trips link method', () => {
    setSignInMethod(U, 'link');
    expect(getSignInMethod(U)).toBe('link');
  });

  it('round-trips password method', () => {
    setSignInMethod(U, 'password');
    expect(getSignInMethod(U)).toBe('password');
  });

  it('clearSessionTracking removes both method and lastActive', () => {
    setSignInMethod(U, 'link');
    touchLastActive(U);
    clearSessionTracking(U);
    expect(getSignInMethod(U)).toBeNull();
    expect(readLastActive(U)).toBeNull();
  });
});

describe('lastActive read/write', () => {
  it('returns null when no timestamp stored', () => {
    expect(readLastActive(U)).toBeNull();
  });

  it('touchLastActive writes current time', () => {
    touchLastActive(U);
    expect(readLastActive(U)).toBe(Date.now());
  });

  it('touchLastActive is throttled within TOUCH_THROTTLE_MS', () => {
    touchLastActive(U);
    const first = readLastActive(U)!;
    vi.advanceTimersByTime(TOUCH_THROTTLE_MS - 1);
    touchLastActive(U);
    expect(readLastActive(U)).toBe(first);
  });

  it('touchLastActive writes again after TOUCH_THROTTLE_MS', () => {
    touchLastActive(U);
    const first = readLastActive(U)!;
    vi.advanceTimersByTime(TOUCH_THROTTLE_MS);
    touchLastActive(U);
    expect(readLastActive(U)).toBe(first + TOUCH_THROTTLE_MS);
  });

  it('touch throttle is per-user', () => {
    touchLastActive('alice');
    touchLastActive('bob');
    expect(readLastActive('alice')).toBe(Date.now());
    expect(readLastActive('bob')).toBe(Date.now());
  });
});

describe('isExpired', () => {
  it('returns false when no timestamp stored (fresh session)', () => {
    expect(isExpired(U)).toBe(false);
  });

  it('returns false when within 48h', () => {
    touchLastActive(U);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    expect(isExpired(U)).toBe(false);
  });

  it('returns true at exactly 48h', () => {
    touchLastActive(U);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
    expect(isExpired(U)).toBe(true);
  });

  it('returns true past 48h', () => {
    touchLastActive(U);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 60_000);
    expect(isExpired(U)).toBe(true);
  });

  it('IDLE_TIMEOUT_MS is 48 hours', () => {
    expect(IDLE_TIMEOUT_MS).toBe(48 * 60 * 60 * 1000);
  });
});
