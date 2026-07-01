import { describe, expect, it } from 'vitest';
import {
  customerFromPassenger, findCustomerMatches, identityFromTraveler, linkPatch, normDob,
  searchCustomers, travelerFromPassenger, unlinkPatch,
} from './customerLink';
import type { Customer, Passenger } from '@/types';

const cust = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1', name: 'Nguyễn Văn A', type: 'individual', contacts: [], note: '',
  createdAt: '2026-01-01', createdBy: 'me',
  travelers: [{ id: 't1', fullName: 'Nguyễn Văn A', dob: '1990-01-01', passportNo: 'C1234567' }],
  ...over,
});

const pax: Passenger = { id: 'p1', name: 'Nguyễn Văn A', dob: '01/01/1990', idNo: 'C1234567' };

describe('normDob', () => {
  it('normalizes dd/mm/yyyy and pads iso', () => {
    expect(normDob('01/01/1990')).toBe('1990-01-01');
    expect(normDob('1990-1-5')).toBe('1990-01-05');
    expect(normDob('')).toBe('');
  });
});

describe('findCustomerMatches', () => {
  it('matches by passport regardless of dob format', () => {
    const m = findCustomerMatches(pax, [cust()]);
    expect(m).toHaveLength(1);
    expect(m[0].reason).toBe('passport');
    expect(m[0].traveler?.id).toBe('t1');
  });

  it('matches by name + dob when no passport', () => {
    const m = findCustomerMatches({ id: 'p2', name: 'Nguyễn Văn A', dob: '1990-01-01' },
      [cust({ travelers: [{ id: 't1', fullName: 'Nguyen Van A', dob: '01/01/1990' }] })]);
    expect(m[0].reason).toBe('name+dob');
  });

  it('falls back to individual name match (weak) after strong matches', () => {
    const m = findCustomerMatches({ id: 'p3', name: 'Nguyễn Văn A' }, [cust({ travelers: [] })]);
    expect(m).toHaveLength(1);
    expect(m[0].reason).toBe('name');
    expect(m[0].traveler).toBeUndefined();
  });

  it('does not match a different person', () => {
    expect(findCustomerMatches({ id: 'p4', name: 'Trần B', idNo: 'X999' }, [cust()])).toHaveLength(0);
  });
});

describe('linkPatch / identity', () => {
  it('copies canonical identity from the traveler', () => {
    const c = cust();
    const patch = linkPatch(c, c.travelers![0]);
    expect(patch.customerId).toBe('c1');
    expect(patch.travelerId).toBe('t1');
    expect(patch.idNo).toBe('C1234567');
    expect(patch.idType).toBe('passport');
  });

  it('links at customer level with no identity copy when no traveler', () => {
    const patch = linkPatch(cust());
    expect(patch.customerId).toBe('c1');
    expect(patch.travelerId).toBeUndefined();
    expect(patch.idNo).toBeUndefined();
  });

  it('identityFromTraveler leaves idType empty without a passport', () => {
    expect(identityFromTraveler({ id: 't', fullName: 'X' }).idType).toBe('');
  });

  it('unlinkPatch clears the link fields', () => {
    expect(unlinkPatch()).toEqual({ customerId: undefined, customerName: undefined, travelerId: undefined });
  });
});

describe('create from passenger', () => {
  it('builds an individual customer with a seeded traveler', () => {
    const { customer, traveler } = customerFromPassenger(pax);
    expect(customer.type).toBe('individual');
    expect(customer.travelers).toHaveLength(1);
    expect(customer.travelers![0].id).toBe(traveler.id);
    expect(traveler.passportNo).toBe('C1234567');
    expect(traveler.dob).toBe('1990-01-01'); // normalized
    expect(customer.id).toBeTruthy();
  });

  it('travelerFromPassenger normalizes dob', () => {
    expect(travelerFromPassenger(pax).dob).toBe('1990-01-01');
  });
});

describe('searchCustomers', () => {
  const list = [cust(), cust({ id: 'c2', name: 'Công ty ABC', type: 'company', travelers: [], contacts: [{ name: 'Bà C', phone: '0912', email: '', position: '' }] })];
  it('returns all on empty query', () => {
    expect(searchCustomers(list, '')).toHaveLength(2);
  });
  it('finds by passport', () => {
    expect(searchCustomers(list, 'C1234567').map((c) => c.id)).toEqual(['c1']);
  });
  it('finds by contact name', () => {
    expect(searchCustomers(list, 'Bà C').map((c) => c.id)).toEqual(['c2']);
  });
});
