import { describe, it, expect } from 'vitest';
import { contractHealth } from './contractHealth';
import type { Contract } from '@/types';

function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'hd1', contractNo: 'HD-1', contractDate: '', contractStatus: 'draft',
    tourName: 'Tour A', tourDest: 'Đà Nẵng', tourDays: 3, tourNights: 2,
    tourStartDate: '2026-08-01', departure: 'TP.HCM',
    contractPax: 10, pricePerPax: 1_000_000,
    partyB: { name: 'Cty X', address: 'Số 1', tel: '', rep: 'A', title: 'GĐ', taxCode: '123', email: '' },
    includes: ['Vé máy bay'], excludes: [],
    payments: [{ id: 'p1', label: 'Cọc', amount: 10_000_000, dueDate: '2026-07-01', note: '', status: 'pending' }],
    cancels: [], bondPercent: 0, hasAcceptance: false, createdAt: '', createdBy: '',
    ...over,
  };
}

describe('contractHealth', () => {
  it('good when fully filled and payments reconcile', () => {
    const h = contractHealth(contract());
    expect(h.level).toBe('good');
    expect(h.issues).toHaveLength(0);
    expect(h.numericWarnings).toHaveLength(0);
  });

  it('warn (not risk) when only profile fields are missing', () => {
    const h = contractHealth(contract({ contractNo: '', partyB: { name: '', address: '', tel: '', rep: '', title: '', taxCode: '', email: '' } }));
    expect(h.level).toBe('warn');
    expect(h.issues.length).toBeGreaterThan(0);
  });

  it('risk when payment total does NOT match contract total', () => {
    // total = 10_000_000 but payment sums to 5_000_000 → lệch
    const h = contractHealth(contract({
      payments: [{ id: 'p1', label: 'Cọc', amount: 5_000_000, dueDate: '', note: '', status: 'pending' }],
    }));
    expect(h.level).toBe('risk');
    expect(h.numericWarnings.length).toBeGreaterThan(0);
  });
});
