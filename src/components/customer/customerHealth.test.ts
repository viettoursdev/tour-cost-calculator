import { describe, expect, it } from 'vitest';
import { computeCustomerHealth, statsForCustomer, type HealthQuote } from './customerHealth';
import type { Customer } from '@/types';

const NOW = '2026-07-01';
const cust = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1', name: 'KH A', type: 'company', contacts: [], note: '', createdAt: '2025-01-01', createdBy: 'me', ...over,
});

describe('statsForCustomer', () => {
  const quotes: HealthQuote[] = [
    { customerId: 'c1', totalCost: 300_000_000, status: 'won', updatedAt: '2026-06-01', paymentSummary: { remaining: 50_000_000 } },
    { customerId: 'c1', totalCost: 200_000_000, status: 'sent', departDate: '2026-05-01' },
    { customerId: 'other', totalCost: 999, status: 'won' },
  ];
  it('aggregates only the customer’s quotes + timeline', () => {
    const s = statsForCustomer(cust({ interactions: [{ id: 'i', at: '2026-06-15', byU: 'u', byName: 'U', type: 'call', text: 'x' }] }), quotes);
    expect(s.totalValueVND).toBe(500_000_000);
    expect(s.tourCount).toBe(2);
    expect(s.wonCount).toBe(1);
    expect(s.openOwingVND).toBe(50_000_000);
    expect(s.interactionCount).toBe(1);
    expect(s.lastActivityISO).toBe('2026-06-15'); // mới nhất giữa tour & chăm sóc
  });
  it('matches by name when no customerId on the quote', () => {
    expect(statsForCustomer(cust({ name: 'KH A' }), [{ customerName: 'KH A', totalCost: 100 }]).tourCount).toBe(1);
  });
});

describe('computeCustomerHealth', () => {
  it('scores a high-value, recent, engaged customer as VIP', () => {
    const r = computeCustomerHealth({ totalValueVND: 800_000_000, tourCount: 4, wonCount: 3, openOwingVND: 0, interactionCount: 6, lastActivityISO: '2026-06-20' }, NOW);
    expect(r.tier).toBe('vip');
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.factors).toHaveLength(4);
  });
  it('marks long-inactive customers dormant regardless of past value', () => {
    const r = computeCustomerHealth({ totalValueVND: 900_000_000, tourCount: 5, wonCount: 5, openOwingVND: 0, interactionCount: 3, lastActivityISO: '2024-01-01' }, NOW);
    expect(r.tier).toBe('dormant');
  });
  it('a brand-new customer with no history is "new" with a low score', () => {
    const r = computeCustomerHealth({ totalValueVND: 0, tourCount: 0, wonCount: 0, openOwingVND: 0, interactionCount: 0 }, NOW);
    expect(r.tier).toBe('new');
    expect(r.score).toBe(0);
  });
  it('caps each factor (value capped at 35 pts)', () => {
    const r = computeCustomerHealth({ totalValueVND: 5_000_000_000, tourCount: 0, wonCount: 0, openOwingVND: 0, interactionCount: 0, lastActivityISO: NOW }, NOW);
    expect(r.score).toBe(35 + 25); // value cap 35 + recency 25
  });
});
