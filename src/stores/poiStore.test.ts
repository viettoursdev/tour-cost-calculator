import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));

import { usePoiStore } from './poiStore';
import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/firebase';
import type { PoiEntry, User } from '@/types';

const resetPoi = snapshotInitial(usePoiStore);
const resetAuth = snapshotInitial(useAuthStore);
const u: User = { u: 'ceo', p: 'x', role: 'CEO', name: 'Tony', color: '#000' };

beforeEach(() => {
  resetPoi();
  resetAuth();
  vi.clearAllMocks();
  useAuthStore.setState({ currentUser: u }, false);
});

const poi = (over: Partial<PoiEntry> = {}): PoiEntry =>
  ({ id: 'p1', place: 'Bà Nà', commentary: 'Cầu Vàng', ...over });

describe('poiStore', () => {
  it('init subscribes and populates', () => {
    usePoiStore.getState().init();
    const cb = vi.mocked(fb.fbSubscribePois).mock.calls[0][0];
    cb([poi()]);
    expect(usePoiStore.getState().pois).toEqual([poi()]);
  });

  it('save prepends a new entry with creator and pushes', async () => {
    await usePoiStore.getState().save(poi({ id: '', place: 'Hội An', commentary: 'Phố cổ' }));
    const list = usePoiStore.getState().pois;
    expect(list).toHaveLength(1);
    expect(list[0].place).toBe('Hội An');
    expect(list[0].createdBy).toBe('Tony');
    expect(list[0].id.length).toBeGreaterThan(0);
    expect(fb.fbPushPois).toHaveBeenCalledTimes(1);
  });

  it('upsertMany adds new places and skips duplicates (case-insensitive)', async () => {
    usePoiStore.setState({ pois: [poi({ id: 'p1', place: 'Bà Nà', commentary: 'cũ' })] }, false);
    const added = await usePoiStore.getState().upsertMany([
      { place: 'bà nà', commentary: 'trùng tên' },     // duplicate → skip
      { place: 'Hội An', commentary: 'Phố cổ' },        // new
      { place: 'Sơn Trà', commentary: '' },             // empty commentary → skip
      { place: 'Hội An', commentary: 'lần 2' },         // dup within batch → skip
    ]);
    expect(added).toBe(1);
    const places = usePoiStore.getState().pois.map((p) => p.place).sort();
    expect(places).toEqual(['Bà Nà', 'Hội An']);
  });

  it('upsertMany is a no-op without a user', async () => {
    useAuthStore.setState({ currentUser: null }, false);
    const n = await usePoiStore.getState().upsertMany([{ place: 'X', commentary: 'Y' }]);
    expect(n).toBe(0);
    expect(fb.fbPushPois).not.toHaveBeenCalled();
  });
});
