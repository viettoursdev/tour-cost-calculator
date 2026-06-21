// tests/etl/itineraries.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';
import { loadItineraries, loadMenus } from '../../scripts/etl/itineraries.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

describe('etl itineraries + menus', () => {
  beforeAll(async () => {
    await resetAll(c);
    const r = makeResolver(await loadProfiles(c, dump));
    await loadItineraries(c, dump, r);
    await loadMenus(c, dump, r);
  });

  it('loads itinerary with days, flights, and start_date', async () => {
    const { data } = await c.from('itineraries').select('legacy_id, start_date, created_by_name');
    expect(data).toHaveLength(1);
    expect(data![0].start_date).toBe('2026-07-01');
    const { count: days } = await c.from('itinerary_days').select('*', { count: 'exact', head: true });
    const { count: fl } = await c.from('itinerary_flights').select('*', { count: 'exact', head: true });
    expect(days).toBe(1); expect(fl).toBe(1);
  });

  it('loads menu with days', async () => {
    const { count: menus } = await c.from('menus').select('*', { count: 'exact', head: true });
    const { count: mdays } = await c.from('menu_days').select('*', { count: 'exact', head: true });
    expect(menus).toBe(1); expect(mdays).toBe(1);
  });
});
