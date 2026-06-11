import type { Customer, Ncc } from '@/types';

/** Ghép ghi chú: nối các thông tin phụ (không có field tương ứng) vào note gốc. */
function joinNote(base: string, extras: string[]): string {
  const tail = extras.filter(Boolean).join(' · ');
  if (!base) return tail;
  if (!tail) return base;
  return `${base} · ${tail}`;
}

/**
 * Khách hàng → Nhà cung cấp (id rỗng để store cấp id mới).
 * - address → location
 * - taxCode + loại cá nhân → gộp vào note (NCC không có field này)
 * - contacts giữ nguyên
 */
export function customerToNcc(c: Customer): Ncc {
  return {
    id: '',
    name: c.name,
    sectors: [],
    location: c.address || '',
    contacts: (c.contacts ?? []).map((ct) => ({ ...ct })),
    note: joinNote(c.note || '', [
      c.taxCode ? `MST: ${c.taxCode}` : '',
      c.type === 'individual' ? '(Cá nhân)' : '',
    ]),
    createdAt: '',
    createdBy: '',
  };
}

/**
 * Nhà cung cấp → Khách hàng (id rỗng để store cấp id mới).
 * - location → address
 * - sectors → gộp vào note (Customer không có field này)
 * - contacts giữ nguyên; mặc định loại "company"
 */
export function nccToCustomer(n: Ncc): Customer {
  return {
    id: '',
    name: n.name,
    type: 'company',
    address: n.location || '',
    taxCode: '',
    contacts: (n.contacts ?? []).map((ct) => ({ ...ct })),
    note: joinNote(n.note || '', [
      n.sectors?.length ? `Lĩnh vực: ${n.sectors.join(', ')}` : '',
    ]),
    createdAt: '',
    createdBy: '',
  };
}
