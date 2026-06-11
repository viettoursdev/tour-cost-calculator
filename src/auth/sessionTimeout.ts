export const IDLE_TIMEOUT_MS = 48 * 60 * 60 * 1000;
export const TOUCH_THROTTLE_MS = 30 * 1000;

export type SignInMethod = 'link' | 'password';

const methodKey = (username: string) => `vte_session_method_${username}`;
const lastActiveKey = (username: string) => `vte_session_last_active_${username}`;

export function getSignInMethod(username: string): SignInMethod | null {
  const v = localStorage.getItem(methodKey(username));
  return v === 'link' || v === 'password' ? v : null;
}

export function setSignInMethod(username: string, method: SignInMethod): void {
  localStorage.setItem(methodKey(username), method);
}

export function clearSessionTracking(username: string): void {
  localStorage.removeItem(methodKey(username));
  localStorage.removeItem(lastActiveKey(username));
}

export function readLastActive(username: string): number | null {
  const raw = localStorage.getItem(lastActiveKey(username));
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function touchLastActive(username: string): void {
  const now = Date.now();
  const prev = readLastActive(username);
  if (prev !== null && now - prev < TOUCH_THROTTLE_MS) return;
  localStorage.setItem(lastActiveKey(username), String(now));
}

export function isExpired(username: string, now: number = Date.now()): boolean {
  const last = readLastActive(username);
  if (last === null) return false;
  return now - last >= IDLE_TIMEOUT_MS;
}

export const CHECK_INTERVAL_MS = 60 * 1000;

export function startActivityTracker(
  username: string,
  onExpire: () => void,
): () => void {
  if (readLastActive(username) === null) {
    touchLastActive(username);
  }

  let fired = false;
  const fireIfExpired = () => {
    if (fired) return;
    if (isExpired(username)) {
      fired = true;
      onExpire();
    }
  };

  const onActivity = () => {
    touchLastActive(username);
    fireIfExpired();
  };

  window.addEventListener('pointerdown', onActivity);
  window.addEventListener('keydown', onActivity);
  window.addEventListener('focus', fireIfExpired);
  document.addEventListener('visibilitychange', fireIfExpired);

  const intervalId = window.setInterval(fireIfExpired, CHECK_INTERVAL_MS);

  return () => {
    window.removeEventListener('pointerdown', onActivity);
    window.removeEventListener('keydown', onActivity);
    window.removeEventListener('focus', fireIfExpired);
    document.removeEventListener('visibilitychange', fireIfExpired);
    window.clearInterval(intervalId);
  };
}
