// tests/etl/profiles.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();
let map: Map<string, string>;

describe('etl profiles', () => {
  beforeAll(async () => {
    await resetAll(c);
    map = await loadProfiles(c, dump);
  });

  it('creates one profile per user with the real role/name', async () => {
    expect(map.size).toBe(3);
    const { data } = await c.from('profiles').select('username, role, name').order('username');
    expect(data).toEqual([
      { username: 'linh', role: 'Operations', name: 'Linh' },
      { username: 'mai', role: 'Sales', name: 'Mai' },
      { username: 'tony', role: 'CEO', name: 'Tony' },
    ]);
  });

  it('resolver returns UUIDs for known users and null for unmapped, recording them', () => {
    const r = makeResolver(map);
    expect(r.resolve('tony')).toBe(map.get('tony'));
    expect(r.resolve('ghost')).toBeNull();
    expect(r.resolve('')).toBeNull();
    expect([...r.unmapped]).toEqual(['ghost']);
  });
});
