import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useItineraryStore } from './itineraryStore';
import { snapshotInitial } from '@/test/storeReset';
import * as sb from '@/lib/supabase';
import type { Itinerary, ItineraryIndexEntry } from '@/types';

const reset = snapshotInitial(useItineraryStore);
beforeEach(() => { reset(); vi.clearAllMocks(); });

function indexEntry(over: Partial<ItineraryIndexEntry> = {}): ItineraryIndexEntry {
  return {
    id: 'it1',
    code: 'IT-1',
    title: 't',
    destination: 'd',
    days: 3,
    nights: 2,
    linkedQuoteName: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

function full(over: Partial<Itinerary> = {}): Itinerary {
  return {
    id: 'it1',
    type: 'NN',
    continent: '',
    country: '',
    seq: 1,
    title: 't',
    destination: 'd',
    days: 3,
    nights: 2,
    intro: '',
    flights: [],
    schedule: [],
    includes: [],
    excludes: [],
    linkedQuoteId: null,
    linkedQuoteName: '',
    ...over,
  };
}

describe('itineraryStore', () => {
  it('starts empty and loading', () => {
    const s = useItineraryStore.getState();
    expect(s.list).toEqual([]);
    expect(s.loading).toBe(true);
  });

  it('init subscribes and loads list', () => {
    useItineraryStore.getState().init();
    expect(sb.sbSubscribeItineraries).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(sb.sbSubscribeItineraries).mock.calls[0][0];
    cb([indexEntry()]);
    const s = useItineraryStore.getState();
    expect(s.list).toEqual([indexEntry()]);
    expect(s.loading).toBe(false);
  });

  it('save forwards to sbSaveItinerary', async () => {
    const itin = full();
    await useItineraryStore.getState().save(itin, 'tester');
    expect(sb.sbSaveItinerary).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sb.sbSaveItinerary).mock.calls[0]).toEqual([itin, 'tester']);
  });

  it('load returns whatever sbGetItinerary resolves with', async () => {
    const itin = full({ id: 'fetched' });
    vi.mocked(sb.sbGetItinerary).mockResolvedValueOnce(itin);
    const got = await useItineraryStore.getState().load('fetched');
    expect(got).toEqual(itin);
    expect(vi.mocked(sb.sbGetItinerary).mock.calls[0]).toEqual(['fetched']);
  });

  it('delete forwards id to sbDeleteItinerary', async () => {
    await useItineraryStore.getState().delete('it1');
    expect(sb.sbDeleteItinerary).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sb.sbDeleteItinerary).mock.calls[0]).toEqual(['it1']);
  });
});
