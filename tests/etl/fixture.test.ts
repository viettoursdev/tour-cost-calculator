import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXPECTED } from './fixtures/expected.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));

describe('etl fixture', () => {
  it('has the exporter shape with singles + collections', () => {
    expect(Object.keys(dump.singles)).toContain('viettours/user_accounts');
    expect(Object.keys(dump.collections)).toContain('quote_projects');
    expect(Object.keys(dump.collections)).toContain('chats');
  });

  it('declares 3 users and the expected profile count', () => {
    expect(dump.singles['viettours/user_accounts'].users).toHaveLength(3);
    expect(EXPECTED.profiles).toBe(3);
  });

  it('contains the deleted-user (ghost) reference exactly once', () => {
    const json = JSON.stringify(dump);
    expect(json.match(/"ghost"/g)).toHaveLength(1);
  });
});
