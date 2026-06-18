import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbPushFxRates, sbSubscribeFxRates, sbPushPois, sbSubscribePois, sbLogAudit, sbSubscribeAuditLog,
} from '../../src/lib/supabase';
import type { PoiEntry } from '../../src/types/itinerary';
import type { AuditEntry } from '../../src/types/audit';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('fx_rates / pois / audit_log', () => {
  beforeEach(async () => { await truncate(['fx_rates', 'pois', 'audit_log']); });

  it('fx round-trips', async () => {
    const c = await getViettoursClient();
    await sbPushFxRates({ USD: 25000, EUR: 27000 }, 'Tony', c);
    const doc = await once<{ rates: Record<string, number> }>((cb) => sbSubscribeFxRates(cb, c));
    expect(doc.rates).toMatchObject({ USD: 25000, EUR: 27000 });
  });

  it('pois round-trip', async () => {
    const c = await getViettoursClient();
    // Use a realistic app-generated (non-UUID) id to prove the legacy_id mapping works.
    const poi: PoiEntry = { id: 'poiabc123', place: 'Hạ Long', commentary: 'Vịnh đẹp' };
    await sbPushPois([poi], { name: 'Tony', role: 'CEO' }, c);
    const list = await once<PoiEntry[]>((cb) => sbSubscribePois(cb, c));
    expect(list.map((p) => p.place)).toContain('Hạ Long');
    expect(list.find((p) => p.place === 'Hạ Long')?.id).toBe('poiabc123');
  });

  it('audit appends + reads newest-first', async () => {
    const c = await getViettoursClient();
    const entry: AuditEntry = { id: 'a1', at: '2026-01-01T00:00:00Z', byU: 'tester', byName: 'QA', action: 'create', entity: 'Báo giá', name: 'X' };
    await sbLogAudit(entry, c);
    const entries = await once<AuditEntry[]>((cb) => sbSubscribeAuditLog(cb, c));
    expect(entries[0].name).toBe('X');
  });
});
