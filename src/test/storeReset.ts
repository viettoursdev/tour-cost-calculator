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
 * Snapshot is deep-cloned via structuredClone so nested arrays/objects don't
 * leak mutations from prior tests.
 */
export function snapshotInitial<T>(store: {
  getState: () => T;
  setState: (s: T, replace: boolean) => void;
}): () => void {
  const initial = structuredClone(store.getState()) as T;
  return () => {
    store.setState(structuredClone(initial) as T, true);
  };
}
