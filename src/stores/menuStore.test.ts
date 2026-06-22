import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useMenuStore } from './menuStore';
import { snapshotInitial } from '@/test/storeReset';
import * as sb from '@/lib/supabase';
import type { Menu, MenuIndexEntry } from '@/types';

const reset = snapshotInitial(useMenuStore);
beforeEach(() => { reset(); vi.clearAllMocks(); });

function indexEntry(over: Partial<MenuIndexEntry> = {}): MenuIndexEntry {
  return {
    id: 'm1',
    code: 'M-1',
    title: 't',
    destination: 'd',
    days: 3,
    linkedItineraryName: '',
    linkedQuoteName: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

function full(over: Partial<Menu> = {}): Menu {
  return {
    id: 'm1',
    type: 'NN',
    continent: '',
    country: '',
    seq: 1,
    title: 't',
    destination: 'd',
    days: 3,
    linkedItineraryId: null,
    linkedItineraryName: '',
    linkedQuoteId: null,
    linkedQuoteName: '',
    schedule: [],
    ...over,
  };
}

describe('menuStore', () => {
  it('starts empty and loading', () => {
    const s = useMenuStore.getState();
    expect(s.list).toEqual([]);
    expect(s.loading).toBe(true);
  });

  it('init subscribes and populates list', () => {
    useMenuStore.getState().init();
    expect(sb.sbSubscribeMenus).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(sb.sbSubscribeMenus).mock.calls[0][0];
    cb([indexEntry()]);
    const s = useMenuStore.getState();
    expect(s.list).toEqual([indexEntry()]);
    expect(s.loading).toBe(false);
  });

  it('save forwards to sbSaveMenu', async () => {
    const m = full();
    await useMenuStore.getState().save(m, 'tester');
    expect(sb.sbSaveMenu).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sb.sbSaveMenu).mock.calls[0]).toEqual([m, 'tester']);
  });

  it('load returns whatever sbGetMenu resolves with', async () => {
    const m = full({ id: 'fetched' });
    vi.mocked(sb.sbGetMenu).mockResolvedValueOnce(m);
    const got = await useMenuStore.getState().load('fetched');
    expect(got).toEqual(m);
  });

  it('delete forwards id to sbDeleteMenu', async () => {
    await useMenuStore.getState().delete('m1');
    expect(vi.mocked(sb.sbDeleteMenu).mock.calls[0]).toEqual(['m1']);
  });
});
