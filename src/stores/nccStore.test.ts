import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useNccStore } from './nccStore';
import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as sb from '@/lib/supabase';
import type { Ncc, User } from '@/types';

const resetNcc = snapshotInitial(useNccStore);
const resetAuth = snapshotInitial(useAuthStore);

const u: User = { u: 'ceo', p: 'ceo123', role: 'CEO', name: 'Tony', color: '#000' };

beforeEach(() => {
  resetNcc();
  resetAuth();
  vi.clearAllMocks();
  useAuthStore.setState({ currentUser: u }, false);
});

function ncc(over: Partial<Ncc> = {}): Ncc {
  return {
    id: 'n1',
    name: 'NCC A',
    sectors: [],
    location: 'Hà Nội',
    contacts: [],
    note: '',
    createdAt: '',
    createdBy: '',
    ...over,
  };
}

describe('nccStore', () => {
  it('starts with empty suppliers', () => {
    expect(useNccStore.getState().suppliers).toEqual([]);
  });

  it('init subscribes and populates list when callback fires', () => {
    useNccStore.getState().init();
    expect(sb.sbSubscribeNcc).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(sb.sbSubscribeNcc).mock.calls[0][0];
    cb([ncc()]);
    const s = useNccStore.getState();
    expect(s.suppliers).toEqual([ncc()]);
    expect(s.loading).toBe(false);
  });

  it('save adds new supplier with createdBy and pushes', async () => {
    await useNccStore.getState().save(ncc({ id: '', name: 'B' }));
    const list = useNccStore.getState().suppliers;
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('B');
    expect(list[0].createdBy).toBe('Tony');
    expect(list[0].id.length).toBeGreaterThan(0);
    // Saves the single edited row (not the whole list) for fast, real-time writes.
    expect(vi.mocked(sb.sbUpsertNcc).mock.calls[0][0].name).toBe('B');
    expect(vi.mocked(sb.sbUpsertNcc).mock.calls[0][1]).toEqual({ name: 'Tony', role: 'CEO' });
  });

  it('save updates existing supplier and stamps updatedBy', async () => {
    useNccStore.setState({ suppliers: [ncc({ id: 'n1', name: 'A' })] }, false);
    await useNccStore.getState().save(ncc({ id: 'n1', name: 'A renamed' }));
    const list = useNccStore.getState().suppliers;
    expect(list[0].name).toBe('A renamed');
    expect(list[0].updatedBy).toBe('Tony');
  });

  it('save is a no-op when no user is signed in', async () => {
    useAuthStore.setState({ currentUser: null }, false);
    await useNccStore.getState().save(ncc({ id: 'x' }));
    expect(useNccStore.getState().suppliers).toEqual([]);
    expect(sb.sbUpsertNcc).not.toHaveBeenCalled();
  });

  it('delete removes by id and pushes', async () => {
    useNccStore.setState({
      suppliers: [ncc({ id: 'n1' }), ncc({ id: 'n2' })],
    }, false);
    await useNccStore.getState().delete('n1');
    expect(useNccStore.getState().suppliers).toEqual([ncc({ id: 'n2' })]);
    expect(sb.sbDeleteNcc).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sb.sbDeleteNcc).mock.calls[0][0]).toBe('n1');
  });
});
