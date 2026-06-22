import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useQuoteStore } from './quoteStore';
import { useAuthStore } from './authStore';
import { useQuoteHistoryStore } from './quoteHistoryStore';
import { snapshotInitial } from '@/test/storeReset';
import * as sb from '@/lib/supabase';
import type { User } from '@/types';

const resetQuote = snapshotInitial(useQuoteStore);
const resetAuth = snapshotInitial(useAuthStore);
const resetHistory = snapshotInitial(useQuoteHistoryStore);

const u: User = { u: 'ceo', p: 'ceo123', role: 'CEO', name: 'Tony', color: '#dc3250' };

beforeEach(() => {
  resetQuote();
  resetAuth();
  resetHistory();
  vi.clearAllMocks();
  useAuthStore.setState({ currentUser: u }, false);
});

describe('quoteStore.init — per-user hydration', () => {
  it('hydrates draft from vte_quote_draft_{username}', () => {
    const seed = {
      state: {
        draft: { template: 'domestic', info: { name: 'Hà Nội 3N2Đ', dest: '', days: 3, nights: 2, startDate: null } },
        view: 'cost',
      },
    };
    localStorage.setItem('vte_quote_draft_ceo', JSON.stringify(seed));
    useQuoteStore.getState().init(u);
    expect(useQuoteStore.getState().draft.template).toBe('domestic');
    expect(useQuoteStore.getState().draft.info.name).toBe('Hà Nội 3N2Đ');
    expect(useQuoteStore.getState().currentUsername).toBe('ceo');
  });

  it('does not cross-leak between users on the same device', () => {
    localStorage.setItem(
      'vte_quote_draft_ceo',
      JSON.stringify({ state: { draft: { template: 'domestic', info: { name: 'A' } } } }),
    );
    localStorage.setItem(
      'vte_quote_draft_sale1',
      JSON.stringify({ state: { draft: { template: 'intl', info: { name: 'B' } } } }),
    );
    useQuoteStore.getState().init(u);
    expect(useQuoteStore.getState().draft.info.name).toBe('A');
    useQuoteStore.getState().init({ ...u, u: 'sale1', role: 'Sales' });
    expect(useQuoteStore.getState().draft.info.name).toBe('B');
  });

  it('discards a persisted DMC draft and replaces it with the empty default', () => {
    const dmcSeed = JSON.stringify({
      state: { draft: { template: 'dmc', info: { name: 'old dmc' } } },
    });
    localStorage.setItem('vte_quote_draft_ceo', dmcSeed);
    useQuoteStore.getState().init(u);
    expect(useQuoteStore.getState().draft.template).toBeNull();
    // The persist middleware re-saves immediately after init() resets state;
    // the eviction succeeded if the stored payload no longer carries the dmc template.
    const after = localStorage.getItem('vte_quote_draft_ceo');
    if (after) {
      const parsed = JSON.parse(after);
      expect(parsed.state.draft.template).not.toBe('dmc');
    }
  });

  it('tolerates malformed JSON and falls back to empty draft', () => {
    localStorage.setItem('vte_quote_draft_ceo', '{not json');
    useQuoteStore.getState().init(u);
    expect(useQuoteStore.getState().draft.template).toBeNull();
  });
});

describe('quoteStore.setView — DMC view restriction', () => {
  it('clamps non-cost/history views to cost when template is dmc', () => {
    useQuoteStore.setState(
      { draft: { ...useQuoteStore.getState().draft, template: 'dmc' } },
      false,
    );
    useQuoteStore.getState().setView('dashboard');
    expect(useQuoteStore.getState().view).toBe('cost');
    useQuoteStore.getState().setView('history');
    expect(useQuoteStore.getState().view).toBe('history');
  });

  it('allows any view when template is not dmc', () => {
    useQuoteStore.setState(
      { draft: { ...useQuoteStore.getState().draft, template: 'domestic' } },
      false,
    );
    useQuoteStore.getState().setView('dashboard');
    expect(useQuoteStore.getState().view).toBe('dashboard');
  });
});

describe('quoteStore.newDraft', () => {
  it('seeds dmcDefaults when template is dmc', () => {
    useQuoteStore.getState().newDraft('dmc');
    const d = useQuoteStore.getState().draft;
    expect(d.outputCurrency).toBe('USD');
    expect(d.dmcPrices).toEqual({ 20: 0, 25: 0, 30: 0, 35: 0, 40: 0 });
    expect(d.dmcMargin).toEqual({ type: 'percent', value: 0 });
  });

  it('does not enable the dmc category for non-dmc templates', () => {
    useQuoteStore.getState().newDraft('domestic');
    expect(useQuoteStore.getState().draft.catEnabled.dmc).toBe(false);
  });

  it('clears currentQuoteId so the next save creates a new project', () => {
    useQuoteStore.setState({
      draft: { ...useQuoteStore.getState().draft, currentQuoteId: 'old-id' },
    }, false);
    useQuoteStore.getState().newDraft('domestic');
    expect(useQuoteStore.getState().draft.currentQuoteId).toBeNull();
  });
});

describe('quoteStore — setter clamps', () => {
  it('setPax clamps to >= 1', () => {
    useQuoteStore.getState().setPax(0);
    expect(useQuoteStore.getState().draft.pax).toBe(1);
    useQuoteStore.getState().setPax(-5);
    expect(useQuoteStore.getState().draft.pax).toBe(1);
  });

  it('setRounding clamps to >= 1', () => {
    useQuoteStore.getState().setRounding(0);
    expect(useQuoteStore.getState().draft.rounding).toBe(1);
  });
});

describe('quoteStore.addItem — default currency follows rateBase', () => {
  it('new line items default to mkItem currency when no rateBase set', () => {
    useQuoteStore.setState({ draft: { ...useQuoteStore.getState().draft, rateBase: undefined, items: {} } });
    useQuoteStore.getState().addItem('hotel');
    expect(useQuoteStore.getState().draft.items.hotel?.[0].cur).toBe('USD');
  });
  it('new line items adopt rateBase as default currency', () => {
    useQuoteStore.setState({ draft: { ...useQuoteStore.getState().draft, rateBase: 'EUR', items: {} } });
    useQuoteStore.getState().addItem('hotel');
    expect(useQuoteStore.getState().draft.items.hotel?.[0].cur).toBe('EUR');
  });
  it('explicit override currency still wins over rateBase', () => {
    useQuoteStore.setState({ draft: { ...useQuoteStore.getState().draft, rateBase: 'EUR', items: {} } });
    useQuoteStore.getState().addItem('flight', { cur: 'VND' });
    expect(useQuoteStore.getState().draft.items.flight?.[0].cur).toBe('VND');
  });
});

describe('quoteStore.importJSON', () => {
  it('rejects files with the wrong _meta.app', () => {
    const raw = JSON.stringify({ _meta: { app: 'something else' }, template: 'domestic' });
    const out = useQuoteStore.getState().importJSON(raw);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('không phải');
  });

  it('rejects malformed JSON with an error message', () => {
    const out = useQuoteStore.getState().importJSON('{not json');
    expect(out.ok).toBe(false);
  });

  it('accepts valid Viettours payload and merges fields', () => {
    const raw = JSON.stringify({
      _meta: { app: 'Viettours Tour Cost Calculator' },
      pax: 25,
      margin: 12,
    });
    expect(useQuoteStore.getState().importJSON(raw)).toEqual({ ok: true });
    expect(useQuoteStore.getState().draft.pax).toBe(25);
    expect(useQuoteStore.getState().draft.margin).toBe(12);
  });

  it('clamps imported pax: 0 to 1', () => {
    const raw = JSON.stringify({
      _meta: { app: 'Viettours Tour Cost Calculator' },
      pax: 0,
    });
    useQuoteStore.getState().importJSON(raw);
    expect(useQuoteStore.getState().draft.pax).toBe(1);
  });
});

describe('quoteStore.exportJSON', () => {
  it('includes _meta with the app identifier and exporter', () => {
    const raw = useQuoteStore.getState().exportJSON();
    const parsed = JSON.parse(raw);
    expect(parsed._meta?.app).toBe('Viettours Tour Cost Calculator');
    expect(parsed._meta?.exportedBy).toContain('Tony');
  });
});

describe('quoteStore.saveCloud', () => {
  it('calls sbSaveQuote for non-dmc templates', async () => {
    useQuoteStore.setState({
      draft: { ...useQuoteStore.getState().draft, template: 'domestic', currentQuoteId: null },
    }, false);
    await useQuoteStore.getState().saveCloud('q1', []);
    expect(sb.sbSaveQuote).toHaveBeenCalledTimes(1);
    expect(sb.sbSaveQuoteState).toHaveBeenCalledTimes(1);
    expect(sb.sbSaveDMCQuote).not.toHaveBeenCalled();
  });

  it('calls sbSaveDMCQuote for dmc templates', async () => {
    useQuoteStore.setState({
      draft: { ...useQuoteStore.getState().draft, template: 'dmc', currentQuoteId: null },
    }, false);
    await useQuoteStore.getState().saveCloud('q1', []);
    expect(sb.sbSaveDMCQuote).toHaveBeenCalledTimes(1);
    expect(sb.sbSaveDMCQuoteState).toHaveBeenCalledTimes(1);
    expect(sb.sbSaveQuote).not.toHaveBeenCalled();
  });

  it('generates a quote code only when the draft is new', async () => {
    useQuoteStore.setState({
      draft: { ...useQuoteStore.getState().draft, template: 'domestic', currentQuoteId: null },
    }, false);
    await useQuoteStore.getState().saveCloud('q1', []);
    expect(sb.generateQuoteCode).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    useQuoteStore.setState({
      draft: { ...useQuoteStore.getState().draft, currentQuoteId: 'existing-id' },
    }, false);
    await useQuoteStore.getState().saveCloud('q1', []);
    expect(sb.generateQuoteCode).not.toHaveBeenCalled();
  });

  it('stamps currentQuoteId on the draft after a successful save', async () => {
    useQuoteStore.setState({
      draft: { ...useQuoteStore.getState().draft, template: 'domestic', currentQuoteId: null },
    }, false);
    await useQuoteStore.getState().saveCloud('q1', []);
    expect(useQuoteStore.getState().draft.currentQuoteId).not.toBeNull();
  });

  it('throws when no template is set on the draft', async () => {
    useQuoteStore.setState({
      draft: { ...useQuoteStore.getState().draft, template: null },
    }, false);
    await expect(useQuoteStore.getState().saveCloud('q1', [])).rejects.toThrow(/template/);
  });
});

describe('quoteStore.toggleCat / addItem / delItem', () => {
  it('toggleCat flips the boolean for a category', () => {
    const before = useQuoteStore.getState().draft.catEnabled.hotel;
    useQuoteStore.getState().toggleCat('hotel');
    expect(useQuoteStore.getState().draft.catEnabled.hotel).toBe(!before);
  });

  it('addItem appends an item to the chosen category', () => {
    useQuoteStore.getState().addItem('hotel', { name: 'Sofitel' });
    const items = useQuoteStore.getState().draft.items.hotel ?? [];
    expect(items.length).toBe(1);
    expect(items[0].name).toBe('Sofitel');
  });

  it('delItem removes by id', () => {
    useQuoteStore.getState().addItem('hotel', { name: 'A' });
    const id = useQuoteStore.getState().draft.items.hotel![0].id;
    useQuoteStore.getState().delItem('hotel', id);
    expect(useQuoteStore.getState().draft.items.hotel).toEqual([]);
  });
});
