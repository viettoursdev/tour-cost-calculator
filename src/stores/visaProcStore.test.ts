import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useVisaProcStore } from './visaProcStore';
import { snapshotInitial } from '@/test/storeReset';
import * as sb from '@/lib/supabase';
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
    expect(sb.sbSubscribeVisaProcs).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(sb.sbSubscribeVisaProcs).mock.calls[0][0];
    cb([indexEntry()]);
    const s = useVisaProcStore.getState();
    expect(s.list).toEqual([indexEntry()]);
    expect(s.loading).toBe(false);
  });

  it('save forwards to sbSaveVisaProc', async () => {
    const d = full();
    await useVisaProcStore.getState().save(d, 'tester');
    expect(vi.mocked(sb.sbSaveVisaProc).mock.calls[0]).toEqual([d, 'tester']);
  });

  it('load returns whatever sbGetVisaProc resolves with', async () => {
    const d = full({ id: 'fetched' });
    vi.mocked(sb.sbGetVisaProc).mockResolvedValueOnce(d);
    expect(await useVisaProcStore.getState().load('fetched')).toEqual(d);
  });

  it('delete forwards id to sbDeleteVisaProc', async () => {
    await useVisaProcStore.getState().delete('vp1');
    expect(vi.mocked(sb.sbDeleteVisaProc).mock.calls[0]).toEqual(['vp1']);
  });
});
