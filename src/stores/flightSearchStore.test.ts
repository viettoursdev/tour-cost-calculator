import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useFlightSearchStore, searchLabel } from './flightSearchStore';
import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as sb from '@/lib/supabase';
import type { FlightSearchParams, FlightSearchResult } from '@/lib/flightSearch';
import type { User } from '@/types';

const resetFlight = snapshotInitial(useFlightSearchStore);
const resetAuth = snapshotInitial(useAuthStore);

const u: User = { u: 'op1', p: 'x', role: 'Operations', name: 'An', color: '#000' };

const params: FlightSearchParams = {
  origin: 'han', destination: 'nrt', departDate: '2026-11-20',
  pax: { adults: 2, children: 0, infants: 0 }, cabin: 'economy',
};
const result: FlightSearchResult = { options: [], citations: [], generatedAt: '2026-07-02T00:00:00Z' };

beforeEach(() => {
  resetFlight();
  resetAuth();
  vi.clearAllMocks();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  useAuthStore.setState({ currentUser: u }, false);
});

describe('searchLabel', () => {
  it('gộp tuyến + ngày + cờ khứ hồi', () => {
    expect(searchLabel(params)).toBe('HAN → NRT · 2026-11-20');
    expect(searchLabel({ ...params, returnDate: '2026-11-27' })).toContain('⇄');
  });
});

describe('load', () => {
  it('nạp lịch sử của user hiện tại', async () => {
    vi.mocked(sb.sbListFlightSearches).mockResolvedValueOnce([
      { id: 'a', createdBy: 'op1', createdAt: 'x', label: 'L', params, result } as never,
    ]);
    await useFlightSearchStore.getState().load();
    expect(sb.sbListFlightSearches).toHaveBeenCalledWith('op1');
    expect(useFlightSearchStore.getState().searches).toHaveLength(1);
    expect(useFlightSearchStore.getState().loading).toBe(false);
  });

  it('không đăng nhập → rỗng, không gọi supabase', async () => {
    useAuthStore.setState({ currentUser: null }, false);
    await useFlightSearchStore.getState().load();
    expect(sb.sbListFlightSearches).not.toHaveBeenCalled();
    expect(useFlightSearchStore.getState().searches).toEqual([]);
  });
});

describe('saveSearch', () => {
  it('prepend + upsert, gán createdBy + label', async () => {
    const rec = await useFlightSearchStore.getState().saveSearch(params, result);
    expect(rec).not.toBeNull();
    expect(rec!.createdBy).toBe('op1');
    expect(rec!.label).toBe('HAN → NRT · 2026-11-20');
    expect(sb.sbUpsertFlightSearch).toHaveBeenCalledTimes(1);
    expect(useFlightSearchStore.getState().searches[0].id).toBe(rec!.id);
  });

  it('rollback khi supabase lỗi', async () => {
    vi.mocked(sb.sbUpsertFlightSearch).mockRejectedValueOnce(new Error('boom'));
    const rec = await useFlightSearchStore.getState().saveSearch(params, result);
    expect(rec).toBeNull();
    expect(useFlightSearchStore.getState().searches).toEqual([]); // đã khôi phục
  });

  it('không đăng nhập → null', async () => {
    useAuthStore.setState({ currentUser: null }, false);
    expect(await useFlightSearchStore.getState().saveSearch(params, result)).toBeNull();
  });
});

describe('remove', () => {
  it('xoá lạc quan + gọi delete', async () => {
    const rec = await useFlightSearchStore.getState().saveSearch(params, result);
    await useFlightSearchStore.getState().remove(rec!.id);
    expect(sb.sbDeleteFlightSearch).toHaveBeenCalledWith(rec!.id);
    expect(useFlightSearchStore.getState().searches).toEqual([]);
  });

  it('rollback khi xoá lỗi', async () => {
    const rec = await useFlightSearchStore.getState().saveSearch(params, result);
    vi.mocked(sb.sbDeleteFlightSearch).mockRejectedValueOnce(new Error('boom'));
    await useFlightSearchStore.getState().remove(rec!.id);
    expect(useFlightSearchStore.getState().searches).toHaveLength(1); // còn nguyên
  });
});
