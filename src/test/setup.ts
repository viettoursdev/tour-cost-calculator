import { afterEach } from 'vitest';

// Node 26 exposes localStorage/sessionStorage as undefined experimental
// globals. vitest's populateGlobal skips them because they already exist in
// the Node global (even as undefined), so jsdom's implementations never get
// injected. Bridge them from the jsdom DOM object that vitest stores on
// globalThis.jsdom.
const g = globalThis as unknown as Record<string, unknown> & {
  jsdom?: { window: { localStorage: Storage; sessionStorage: Storage } };
};
if (g.jsdom) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: g.jsdom.window.localStorage,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: g.jsdom.window.sessionStorage,
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
