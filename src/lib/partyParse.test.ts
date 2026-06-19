import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));
import { extractObject, mapNcc, mapCustomer } from './partyParse';

describe('extractObject', () => {
  it('bóc JSON object kể cả có fence/chữ quanh', () => {
    expect(extractObject('Kết quả:\n```json\n{"name":"A"}\n```')).toEqual({ name: 'A' });
  });
  it('null nếu không phải object', () => {
    expect(extractObject('không có gì')).toBeNull();
    expect(extractObject('[1,2]')).toBeNull();
  });
});

describe('mapNcc', () => {
  it('chuẩn hoá sectors (chuỗi/mảng), contacts, alias trường', () => {
    const n = mapNcc({ company: 'KS Mường Thanh', services: 'Khách sạn; Ăn uống', city: 'Đà Nẵng',
      contacts: [{ name: 'A', mobile: '0900', title: 'Sales' }, { phone: '', name: '' }] });
    expect(n.name).toBe('KS Mường Thanh');
    expect(n.sectors).toEqual(['Khách sạn', 'Ăn uống']);
    expect(n.location).toBe('Đà Nẵng');
    expect(n.contacts).toEqual([{ name: 'A', phone: '0900', email: '', position: 'Sales' }]);
  });
});

describe('mapCustomer', () => {
  it('suy type + alias MST/tags', () => {
    const c = mapCustomer({ name: 'Cty X', type: 'Công ty', mst: '0101', tags: 'VIP, B2B', taxId: '' });
    expect(c.type).toBe('company');
    expect(c.taxCode).toBe('0101');
    expect(c.tags).toEqual(['VIP', 'B2B']);
  });
  it('cá nhân → individual', () => {
    expect(mapCustomer({ name: 'Anh A', type: 'cá nhân' }).type).toBe('individual');
  });
});
