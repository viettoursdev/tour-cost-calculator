import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));

import { useVisaProcStore } from './visaProcStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/firebase';
import type { VisaProcDoc, VisaProcIndexEntry } from '@/types';

const reset = snapshotInitial(useVisaProcStore);
beforeEach(() => { reset(); vi.clearAllMocks(); });

function indexEntry(over: Partial<VisaProcIndexEntry> = {}): VisaProcIndexEntry {
  return {
    id: 'vp1',
    code: 'VP-1',
    title: 't',
    country: 'VN',
    linkedQuoteName: '',
    collaborators: [],
    createdByUsername: '',
    createdByName: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

function full(over: Partial<VisaProcDoc> = {}): VisaProcDoc {
  return {
    id: 'vp1',
    code: 'VP-1',
    title: 't',
    country: 'VN',
    linkedQuoteId: null,
    linkedQuoteName: '',
    createdByUsername: '',
    createdByName: '',
    collaborators: [],
    sections: [],
    versions: [],
    ...over,
  };
}

describe('visaProcStore', () => {
  it('starts empty and loading', () => {
    const s = useVisaProcStore.getState();
    expect(s.list).toEqual([]);
    expect(s.loading).toBe(true);
  });

  it('init subscribes and populates list', () => {
    useVisaProcStore.getState().init();
    expect(fb.fbSubscribeVisaProcs).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(fb.fbSubscribeVisaProcs).mock.calls[0][0];
    cb([indexEntry()]);
    const s = useVisaProcStore.getState();
    expect(s.list).toEqual([indexEntry()]);
    expect(s.loading).toBe(false);
  });

  it('save forwards to fbSaveVisaProc', async () => {
    const d = full();
    await useVisaProcStore.getState().save(d, 'tester');
    expect(vi.mocked(fb.fbSaveVisaProc).mock.calls[0]).toEqual([d, 'tester']);
  });

  it('load returns whatever fbGetVisaProc resolves with', async () => {
    const d = full({ id: 'fetched' });
    vi.mocked(fb.fbGetVisaProc).mockResolvedValueOnce(d);
    expect(await useVisaProcStore.getState().load('fetched')).toEqual(d);
  });

  it('delete forwards id to fbDeleteVisaProc', async () => {
    await useVisaProcStore.getState().delete('vp1');
    expect(vi.mocked(fb.fbDeleteVisaProc).mock.calls[0]).toEqual(['vp1']);
  });
});
