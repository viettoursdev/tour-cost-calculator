import { describe, it, expect } from 'vitest';
import { buildSearchIndex } from './searchIndex';
import type { CloudQuoteEntry, Customer, Ncc } from '@/types';

const quote = (p: Partial<CloudQuoteEntry>): CloudQuoteEntry =>
  ({ cloudId: 'c1', name: '', quoteCode: '', template: 'domestic', pax: 1, totalCost: 0, customerName: '', collaborators: [], createdByUsername: '', createdByName: '', createdAt: '', updatedAt: '', updatedBy: '', id: 1, ...p } as CloudQuoteEntry);

describe('buildSearchIndex', () => {
  it('maps quotes by template to quoteDom/quoteIntl with subtitle and search text', () => {
    const idx = buildSearchIndex({
      quotes: [
        quote({ template: 'domestic', cloudId: 'd1', name: 'Tour Đà Nẵng', quoteCode: 'BG01', customerName: 'Khách X' }),
        quote({ template: 'intl', cloudId: 'i1', name: 'Tour Nhật', quoteCode: 'BG02' }),
      ],
    });
    expect(idx).toHaveLength(2);
    expect(idx[0]).toMatchObject({ kind: 'quoteDom', id: 'd1', title: 'Tour Đà Nẵng', subtitle: 'BG01 · Khách X' });
    expect(idx[0].text).toContain('Khách X');
    expect(idx[1].kind).toBe('quoteIntl');
  });

  it('maps customers and suppliers', () => {
    const idx = buildSearchIndex({
      customers: [{ id: 'cu1', name: 'Công ty A', taxCode: '123', contacts: [{ name: 'Anh B', phone: '090' }] } as unknown as Customer],
      suppliers: [{ id: 'n1', name: 'KS Mường Thanh', location: 'Đà Nẵng', sectors: ['Khách sạn'], note: '' } as unknown as Ncc],
    });
    const cust = idx.find((x) => x.kind === 'customer');
    const ncc = idx.find((x) => x.kind === 'ncc');
    expect(cust?.title).toBe('Công ty A');
    expect(cust?.text).toContain('Anh B');
    expect(ncc?.subtitle).toBe('Đà Nẵng · Khách sạn');
  });

  it('returns empty for empty input', () => {
    expect(buildSearchIndex({})).toEqual([]);
  });
});
