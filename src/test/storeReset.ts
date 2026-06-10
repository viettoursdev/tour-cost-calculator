/**
 * Snapshot a Zustand store's initial state for restoration between tests.
 *
 * Use ONCE per test file at module top level, BEFORE any test mutates the store:
 *
 *   import { snapshotInitial } from '@/test/storeReset';
 *   import { useFooStore } from './fooStore';
 *   const reset = snapshotInitial(useFooStore);
 *   beforeEach(reset);
 *
 * Data is deep-cloned so nested arrays/objects don't leak mutations between
 * tests; functions (Zustand actions) are preserved by reference.
 */
function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value === 'function') return value;
  if (Array.isArray(value)) return value.map(deepClone) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as object)) {
    out[k] = deepClone((value as Record<string, unknown>)[k]);
  }
  return out as T;
}

export function snapshotInitial<T>(store: {
  getState: () => T;
  setState: (s: T, replace: boolean) => void;
}): () => void {
  const initial = deepClone(store.getState());
  return () => {
    store.setState(deepClone(initial), true);
  };
}
