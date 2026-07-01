import { describe, expect, it } from 'vitest';
import { reconcileVisibleEdits } from './applicantFilter';

type Row = { id: string; name: string };
const full: Row[] = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];

describe('reconcileVisibleEdits', () => {
  it('applies edits to visible rows, preserves hidden ones and order', () => {
    const visible = new Set(['b']);
    const after: Row[] = [{ id: 'b', name: 'B mới' }];
    expect(reconcileVisibleEdits(full, visible, after)).toEqual([
      { id: 'a', name: 'A' }, { id: 'b', name: 'B mới' }, { id: 'c', name: 'C' },
    ]);
  });

  it('deletes a visible row without touching hidden rows', () => {
    const visible = new Set(['a', 'b']);        // c is hidden
    const after: Row[] = [{ id: 'a', name: 'A' }]; // b deleted from the visible set
    expect(reconcileVisibleEdits(full, visible, after).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('is a no-op when everything is visible and unchanged', () => {
    const visible = new Set(['a', 'b', 'c']);
    expect(reconcileVisibleEdits(full, visible, full)).toEqual(full);
  });

  it('does not delete a hidden row even if absent from after', () => {
    const visible = new Set(['a']);
    expect(reconcileVisibleEdits(full, visible, []).map((r) => r.id)).toEqual(['b', 'c']);
  });
});
