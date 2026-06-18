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

  it('Fix3: audit cap trim runs without error on a small table (no-op when count<=2000)', async () => {
    const c = await getViettoursClient();
    // Insert 3 rows — well below the 2000-cap so trim is a no-op, but the trim logic must not throw.
    const base = { byU: 'tester', byName: 'QA', action: 'create' as const, entity: 'Test', name: 'cap-test' };
    await sbLogAudit({ id: 'cap-1', at: '2026-01-01T01:00:00Z', ...base }, c);
    await sbLogAudit({ id: 'cap-2', at: '2026-01-01T02:00:00Z', ...base }, c);
    await sbLogAudit({ id: 'cap-3', at: '2026-01-01T03:00:00Z', ...base }, c);
    const entries = await once<AuditEntry[]>((cb) => sbSubscribeAuditLog(cb, c));
    // All 3 retained (table has 4 including the row from the previous test, all well under 2000)
    expect(entries.length).toBeGreaterThanOrEqual(3);
  });
});
