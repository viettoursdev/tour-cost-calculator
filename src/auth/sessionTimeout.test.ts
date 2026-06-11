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
  startActivityTracker,
  CHECK_INTERVAL_MS,
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

describe('startActivityTracker', () => {
  beforeEach(() => {
    // Initialise lastActive so the tracker has a reference point.
    touchLastActive(U);
  });

  it('initializes lastActive on start if none stored', () => {
    clearSessionTracking(U);
    expect(readLastActive(U)).toBeNull();
    const stop = startActivityTracker(U, () => {});
    expect(readLastActive(U)).toBe(Date.now());
    stop();
  });

  it('does not overwrite lastActive on start if already stored', () => {
    const before = readLastActive(U);
    vi.advanceTimersByTime(1000);
    const stop = startActivityTracker(U, () => {});
    expect(readLastActive(U)).toBe(before);
    stop();
  });

  it('updates lastActive on pointerdown', () => {
    const stop = startActivityTracker(U, () => {});
    vi.advanceTimersByTime(TOUCH_THROTTLE_MS + 1000);
    window.dispatchEvent(new Event('pointerdown'));
    expect(readLastActive(U)).toBe(Date.now());
    stop();
  });

  it('updates lastActive on keydown', () => {
    const stop = startActivityTracker(U, () => {});
    vi.advanceTimersByTime(TOUCH_THROTTLE_MS + 2000);
    window.dispatchEvent(new Event('keydown'));
    expect(readLastActive(U)).toBe(Date.now());
    stop();
  });

  it('calls onExpire when interval fires after timeout', () => {
    const onExpire = vi.fn();
    const stop = startActivityTracker(U, onExpire);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + CHECK_INTERVAL_MS);
    expect(onExpire).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not call onExpire while still within timeout', () => {
    const onExpire = vi.fn();
    const stop = startActivityTracker(U, onExpire);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - CHECK_INTERVAL_MS);
    expect(onExpire).not.toHaveBeenCalled();
    stop();
  });

  it('visibilitychange triggers an immediate expiry check', () => {
    const onExpire = vi.fn();
    // Pre-age lastActive past the timeout WITHOUT advancing fake timers
    // (so the interval hasn't fired yet).
    localStorage.setItem(`vte_session_last_active_${U}`, String(Date.now() - IDLE_TIMEOUT_MS - 1));
    const stop = startActivityTracker(U, onExpire);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onExpire).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stop() removes listeners and stops the interval', () => {
    const onExpire = vi.fn();
    const stop = startActivityTracker(U, onExpire);
    stop();
    // After stop, advancing time past the timeout must not fire onExpire.
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS * 2);
    expect(onExpire).not.toHaveBeenCalled();
    // And events must not update lastActive.
    const frozen = readLastActive(U);
    vi.advanceTimersByTime(TOUCH_THROTTLE_MS + 1000);
    window.dispatchEvent(new Event('pointerdown'));
    expect(readLastActive(U)).toBe(frozen);
  });

  it('onExpire fires at most once per tracker', () => {
    const onExpire = vi.fn();
    const stop = startActivityTracker(U, onExpire);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + CHECK_INTERVAL_MS * 5);
    expect(onExpire).toHaveBeenCalledTimes(1);
    stop();
  });
});
