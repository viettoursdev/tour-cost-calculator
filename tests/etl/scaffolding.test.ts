import { describe, it, expect } from 'vitest';
import { serviceClient, resetAll, insert, CHILD_FIRST_TABLES } from '../../scripts/etl/db.mjs';
import { nameFromActor, dateOnly, iso } from '../../scripts/etl/util.mjs';

describe('etl scaffolding', () => {
  it('parses "Name (Role)" actor strings to a bare name', () => {
    expect(nameFromActor('Tony Nguyen (CEO)')).toBe('Tony Nguyen');
    expect(nameFromActor('plain')).toBe('plain');
    expect(nameFromActor(undefined)).toBe('');
  });

  it('normalizes dates and timestamps', () => {
    expect(dateOnly('2026-06-20T08:00:00.000Z')).toBe('2026-06-20');
    expect(dateOnly(undefined)).toBeNull();
    expect(iso(undefined)).toBeNull();
    expect(iso('2026-06-20T08:00:00.000Z')).toBe('2026-06-20T08:00:00.000Z');
  });

  it('CHILD_FIRST_TABLES lists children before their parents', () => {
    const i = (t: string) => CHILD_FIRST_TABLES.indexOf(t);
    expect(i('customer_contacts')).toBeLessThan(i('customers'));
    expect(i('quote_line_items')).toBeLessThan(i('quotes'));
    expect(i('chat_messages')).toBeLessThan(i('chats'));
    expect(i('quotes')).toBeLessThan(i('customers')); // quotes FK customers
  });

  it('resetAll then insert round-trips a row', async () => {
    const c = serviceClient();
    await resetAll(c);
    await insert(c, 'fx_rates', [{ currency: 'USD', rate_to_vnd: 25000, pushed_by: 'tony' }]);
    const { data } = await c.from('fx_rates').select('currency');
    expect(data).toEqual([{ currency: 'USD' }]);
  });
});
