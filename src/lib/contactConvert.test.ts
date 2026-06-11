import { describe, it, expect } from 'vitest';
import { customerToNcc, nccToCustomer } from './contactConvert';
import type { Customer, Ncc } from '@/types';

const baseCustomer: Customer = {
  id: 'c1',
  name: 'ACME Co',
  type: 'company',
  address: '12 Lê Lợi, Q1',
  taxCode: '0312345678',
  contacts: [{ name: 'An', phone: '0900', email: 'an@acme.com', position: 'PM' }],
  note: 'VIP',
  createdAt: '2026-01-01',
  createdBy: 'tester',
};

const baseNcc: Ncc = {
  id: 'n1',
  name: 'Hotel X',
  sectors: ['Khách sạn', 'Hội nghị'],
  location: 'Đà Nẵng',
  contacts: [{ name: 'Bình', phone: '0911', email: 'binh@x.com', position: 'Sales' }],
  note: 'Đối tác lâu năm',
  createdAt: '2026-01-01',
  createdBy: 'tester',
};

describe('customerToNcc', () => {
  it('maps core fields and clears id/audit so the store assigns fresh ones', () => {
    const n = customerToNcc(baseCustomer);
    expect(n.id).toBe('');
    expect(n.createdAt).toBe('');
    expect(n.createdBy).toBe('');
    expect(n.name).toBe('ACME Co');
    expect(n.location).toBe('12 Lê Lợi, Q1');
    expect(n.sectors).toEqual([]);
    expect(n.contacts).toEqual(baseCustomer.contacts);
  });

  it('folds taxCode into the note (NCC has no taxCode field)', () => {
    const n = customerToNcc(baseCustomer);
    expect(n.note).toContain('VIP');
    expect(n.note).toContain('MST: 0312345678');
  });

  it('flags individual type in the note', () => {
    const n = customerToNcc({ ...baseCustomer, type: 'individual', note: '' });
    expect(n.note).toContain('(Cá nhân)');
  });

  it('does a deep copy of contacts', () => {
    const n = customerToNcc(baseCustomer);
    expect(n.contacts).not.toBe(baseCustomer.contacts);
    expect(n.contacts[0]).not.toBe(baseCustomer.contacts[0]);
  });
});

describe('nccToCustomer', () => {
  it('maps core fields, defaults to company, clears id/audit', () => {
    const c = nccToCustomer(baseNcc);
    expect(c.id).toBe('');
    expect(c.createdAt).toBe('');
    expect(c.type).toBe('company');
    expect(c.name).toBe('Hotel X');
    expect(c.address).toBe('Đà Nẵng');
    expect(c.taxCode).toBe('');
    expect(c.contacts).toEqual(baseNcc.contacts);
  });

  it('folds sectors into the note (Customer has no sectors field)', () => {
    const c = nccToCustomer(baseNcc);
    expect(c.note).toContain('Đối tác lâu năm');
    expect(c.note).toContain('Lĩnh vực: Khách sạn, Hội nghị');
  });

  it('handles empty optional fields without leaving stray separators', () => {
    const c = nccToCustomer({ ...baseNcc, sectors: [], note: '' });
    expect(c.note).toBe('');
  });
});
