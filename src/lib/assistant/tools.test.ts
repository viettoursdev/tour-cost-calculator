import { describe, it, expect, vi, beforeEach } from 'vitest';

const draft = (p: Record<string, unknown>) => ({
  template: 'intl', info: { name: '', dest: 'Nhật Bản', days: 5, nights: 4, startDate: '2026-03-01' },
  pax: 15, rates: { VND: 1 }, margin: 10, vat: 8, svcBasis: 500000, rounding: 1000,
  items: {}, catEnabled: {}, ...p,
});

vi.mock('./data', () => ({
  permittedIndex: () => [
    { kind: 'quoteIntl', id: 'i1', title: 'Tour Nhật', subtitle: 'BG02', text: 'Tour Nhật BG02 Nhật Bản' },
    { kind: 'customer', id: 'cu1', title: 'Cty A', subtitle: '', text: 'Cty A' },
  ],
  permittedData: () => ({
    contracts: [{ id: 'k1', contractNo: 'HD01', tourName: 'Tour Nhật', tourDest: 'Nhật Bản', partyB: { name: 'KS Sakura' } }],
    itineraries: [{ id: 'it1', title: 'Tour Nhật 5N4Đ', destination: 'Nhật Bản', days: 5 }],
    menus: [],
  }),
  visibleQuotesAll: () => [
    { cloudId: 'i1', template: 'intl', name: 'Tour Nhật', quoteCode: 'BG02', customerName: 'Cty A', pax: 15, totalCost: 100, updatedAt: '2026-02-01' },
    { cloudId: 'd1', template: 'domestic', name: 'Tour Đà Nẵng', quoteCode: 'BG01', customerName: 'Cty B', pax: 20, totalCost: 80, updatedAt: '2026-01-01' },
  ],
}));

vi.mock('@/lib/firebase', async () => ({
  // Spread the full gateway stub so the dataBackend barrel (transitively loaded
  // via repointed stores) can re-export every name; override the two used here.
  ...(await import('@/test/firebaseStub')),
  fbGetQuoteProject: vi.fn(async () => ({ currentState: draft({}) })),
  fbGetDMCQuoteProject: vi.fn(async () => ({ currentState: draft({}) })),
}));

vi.mock('@/stores/poiStore', () => ({
  usePoiStore: { getState: () => ({ pois: [{ id: 'p1', place: 'Núi Phú Sĩ', destination: 'Nhật Bản', commentary: 'Biểu tượng nước Nhật.' }] }) },
}));

import { runAssistantTool } from './tools';

const run = async (name: string, input: Record<string, unknown>) => JSON.parse(await runAssistantTool(name, input));

beforeEach(() => vi.clearAllMocks());

describe('assistant tools', () => {
  it('search_records finds by keyword (accent-insensitive)', async () => {
    const r = await run('search_records', { query: 'nhat' });
    expect(r.results.some((x: { id: string }) => x.id === 'i1')).toBe(true);
  });

  it('search_records filters by kinds', async () => {
    const r = await run('search_records', { query: 'a', kinds: ['customer'] });
    expect(r.results.every((x: { kind: string }) => x.kind === 'customer')).toBe(true);
  });

  it('customer_tours lists tours of a customer', async () => {
    const r = await run('customer_tours', { name: 'Cty A' });
    expect(r.count).toBe(1);
    expect(r.tours[0].quoteCode).toBe('BG02');
  });

  it('supplier_usage finds contracts by supplier name', async () => {
    const r = await run('supplier_usage', { name: 'sakura' });
    expect(r.count).toBe(1);
    expect(r.contracts[0].contractNo).toBe('HD01');
  });

  it('get_quote returns detail with pricing config', async () => {
    const r = await run('get_quote', { cloudId: 'i1' });
    expect(r.name).toBe('Tour Nhật');
    expect(r.marginPct).toBe(10);
    expect(r.serviceChargeVND).toBe(500000);
    expect(r.destination).toBe('Nhật Bản');
  });

  it('get_quote denies records outside permission', async () => {
    const r = await run('get_quote', { cloudId: 'unknown' });
    expect(r.error).toBeTruthy();
  });

  it('pricing_stats averages config across sampled quotes', async () => {
    const r = await run('pricing_stats', {});
    expect(r.sampleSize).toBe(2);
    expect(r.avgMarginPct).toBe(10);
    expect(r.avgServiceChargeVND).toBe(500000);
  });

  it('list_itineraries filters by destination', async () => {
    const r = await run('list_itineraries', { destination: 'nhat' });
    expect(r.count).toBe(1);
    expect(r.itineraries[0].id).toBe('it1');
  });

  it('search_pois finds a point of interest', async () => {
    const r = await run('search_pois', { query: 'phu si' });
    expect(r.count).toBe(1);
    expect(r.pois[0].place).toBe('Núi Phú Sĩ');
  });
});
