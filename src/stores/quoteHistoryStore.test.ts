import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useQuoteHistoryStore } from './quoteHistoryStore';
import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/supabase';
import type { CloudQuoteEntry, User } from '@/types';

const resetHistory = snapshotInitial(useQuoteHistoryStore);
const resetAuth = snapshotInitial(useAuthStore);

const u: User = { u: 'ceo', p: 'ceo123', role: 'CEO', name: 'Tony', color: '#000' };

beforeEach(() => {
  resetHistory();
  resetAuth();
  vi.clearAllMocks();
  useAuthStore.setState({ currentUser: u }, false);
});

function entry(over: Partial<CloudQuoteEntry> = {}): CloudQuoteEntry {
  return {
    id: 1,
    cloudId: 'q1',
    quoteCode: 'Q-1',
    name: 'Quote',
    template: 'domestic',
    pax: 10,
    totalCost: 0,
    createdByUsername: 'ceo',
    createdByName: 'Tony',
    collaborators: [],
    createdAt: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

describe('quoteHistoryStore', () => {
  it('starts with empty quotes and dmcQuotes', () => {
    const s = useQuoteHistoryStore.getState();
    expect(s.quotes).toEqual([]);
    expect(s.dmcQuotes).toEqual([]);
  });

  it('init wires both subscribers', () => {
    useQuoteHistoryStore.getState().init(u);
    expect(fb.sbSubscribeQuoteHistory).toHaveBeenCalledTimes(1);
    expect(fb.sbSubscribeDMCQuoteHistory).toHaveBeenCalledTimes(1);
  });

  it('regular subscriber updates quotes only; dmc subscriber updates dmcQuotes only', () => {
    useQuoteHistoryStore.getState().init(u);
    const cbReg = vi.mocked(fb.sbSubscribeQuoteHistory).mock.calls[0][0];
    const cbDmc = vi.mocked(fb.sbSubscribeDMCQuoteHistory).mock.calls[0][0];
    cbReg([entry({ id: 1 })]);
    expect(useQuoteHistoryStore.getState().quotes).toHaveLength(1);
    expect(useQuoteHistoryStore.getState().dmcQuotes).toEqual([]);
    cbDmc([entry({ id: 2, template: 'dmc' })]);
    expect(useQuoteHistoryStore.getState().dmcQuotes).toHaveLength(1);
    expect(useQuoteHistoryStore.getState().quotes).toHaveLength(1);
  });

  it('init returns a function that unsubscribes both', () => {
    const unsubReg = vi.fn();
    const unsubDmc = vi.fn();
    vi.mocked(fb.sbSubscribeQuoteHistory).mockReturnValueOnce(unsubReg);
    vi.mocked(fb.sbSubscribeDMCQuoteHistory).mockReturnValueOnce(unsubDmc);
    const teardown = useQuoteHistoryStore.getState().init(u);
    teardown();
    expect(unsubReg).toHaveBeenCalled();
    expect(unsubDmc).toHaveBeenCalled();
  });

  it('visibleQuotes returns only quotes owned or collaborated on by current user', () => {
    useQuoteHistoryStore.setState({
      quotes: [
        entry({ id: 1, createdByUsername: 'ceo' }),
        entry({ id: 2, createdByUsername: 'someone-else' }),
        entry({ id: 3, createdByUsername: 'sale1', collaborators: [{ u: 'ceo', name: 'T' }] }),
      ],
    }, false);
    const visible = useQuoteHistoryStore.getState().visibleQuotes('domestic');
    expect(visible.map((q) => q.id).sort()).toEqual([1, 3]);
  });

  it('visibleQuotes("dmc") reads from dmcQuotes', () => {
    useQuoteHistoryStore.setState({
      dmcQuotes: [entry({ id: 10, template: 'dmc' })],
      quotes: [entry({ id: 11 })],
    }, false);
    const visible = useQuoteHistoryStore.getState().visibleQuotes('dmc');
    expect(visible.map((q) => q.id)).toEqual([10]);
  });

  it('visibleQuotes returns [] when no user is signed in', () => {
    useAuthStore.setState({ currentUser: null }, false);
    useQuoteHistoryStore.setState({
      quotes: [entry({ id: 1, createdByUsername: 'ceo' })],
    }, false);
    expect(useQuoteHistoryStore.getState().visibleQuotes('domestic')).toEqual([]);
  });
});
