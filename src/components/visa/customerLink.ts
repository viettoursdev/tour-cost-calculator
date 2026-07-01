/**
 * Cầu nối Khách hàng (CRM) ↔ Khách xin visa (applicant/Passenger).
 *
 * Nguyên tắc: `TravelerDoc` của một Customer là NGUỒN SỰ THẬT cho danh tính/hộ
 * chiếu của một người. Khi một applicant được gắn vào (customerId + travelerId),
 * các trường danh tính của applicant là bản chiếu của TravelerDoc — có thể đồng bộ
 * lại 1 chạm. Trường quy trình visa (docStatus/result/visaStatus/timeline/docs)
 * vẫn RIÊNG của applicant (không đẩy ngược lên khách).
 */
import { normalizeVN } from '@/lib/search';
import { normPassport } from './applicantMatch';
import type { Customer, Passenger, TravelerDoc, User } from '@/types';

const newLegacyId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const newTravelerId = () => 'trv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Chuẩn hoá ngày sinh về yyyy-mm-dd để so khớp ổn định (nhận cả dd/mm/yyyy). */
export function normDob(s: string | null | undefined): string {
  const v = (s ?? '').trim();
  if (!v) return '';
  // yyyy-mm-dd (đã chuẩn)
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // dd/mm/yyyy hoặc dd-mm-yyyy
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return v;
}

/** Danh tính rút từ một TravelerDoc — các trường sẽ chiếu xuống applicant. */
export function identityFromTraveler(t: TravelerDoc): Partial<Passenger> {
  return {
    name: t.fullName ?? '',
    gender: (t.gender as Passenger['gender']) ?? '',
    dob: t.dob ?? '',
    idType: t.passportNo ? 'passport' : '',
    idNo: t.passportNo ?? '',
    passportIssue: t.passportIssueDate ?? '',
    passportExpiry: t.passportExpiry ?? '',
    nationality: t.nationality ?? '',
  };
}

/** Patch gắn applicant vào (customer, traveler) + chiếu danh tính xuống. */
export function linkPatch(customer: Customer, traveler?: TravelerDoc): Partial<Passenger> {
  return {
    customerId: customer.id,
    customerName: customer.name,
    travelerId: traveler?.id,
    ...(traveler ? identityFromTraveler(traveler) : {}),
  };
}

/** Patch gỡ liên kết (giữ nguyên danh tính đang có trên applicant). */
export function unlinkPatch(): Partial<Passenger> {
  return { customerId: undefined, customerName: undefined, travelerId: undefined };
}

/** TravelerDoc seed từ một khách visa (dùng khi tạo khách/hồ sơ giấy tờ mới). */
export function travelerFromPassenger(p: Passenger, user?: User | null): TravelerDoc {
  return {
    id: newTravelerId(),
    fullName: p.name ?? '',
    gender: (p.gender as TravelerDoc['gender']) ?? '',
    dob: normDob(p.dob),
    nationality: p.nationality ?? '',
    passportNo: p.idNo ?? '',
    passportIssueDate: p.passportIssue ?? '',
    passportExpiry: p.passportExpiry ?? '',
    updatedAt: new Date().toISOString(),
    updatedBy: user?.name,
  };
}

/** Customer (cá nhân) mới từ một khách visa, kèm 1 TravelerDoc. Trả cả traveler
 *  để gắn ngay. `id` (legacy) sinh sẵn để biết trước khi lưu. */
export function customerFromPassenger(p: Passenger, user?: User | null): { customer: Customer; traveler: TravelerDoc } {
  const traveler = travelerFromPassenger(p, user);
  const now = new Date().toISOString();
  const customer: Customer = {
    id: newLegacyId(),
    name: (p.name ?? '').trim() || 'Khách visa',
    type: 'individual',
    contacts: p.phone ? [{ name: p.name ?? '', phone: p.phone, email: '', position: '' }] : [],
    note: '',
    travelers: [traveler],
    createdAt: now,
    createdBy: user?.name ?? '',
    createdByU: user?.u,
  };
  return { customer, traveler };
}

export interface CustomerMatch {
  customer: Customer;
  traveler?: TravelerDoc;
  reason: 'passport' | 'name+dob' | 'name';
}

/**
 * Tìm khách hàng/hồ sơ giấy tờ khớp với một khách visa (theo số hộ chiếu, hoặc
 * tên-không-dấu + ngày sinh, hoặc tên khách cá nhân). Ưu tiên khớp mạnh trước.
 */
export function findCustomerMatches(p: Passenger, customers: Customer[]): CustomerMatch[] {
  const pass = normPassport(p.idNo);
  const name = normalizeVN(p.name);
  const dob = normDob(p.dob);
  const strong: CustomerMatch[] = [];
  const weak: CustomerMatch[] = [];
  for (const c of customers) {
    let travelerMatched = false;
    for (const t of c.travelers ?? []) {
      const tp = normPassport(t.passportNo);
      if (pass && tp && pass === tp) { strong.push({ customer: c, traveler: t, reason: 'passport' }); travelerMatched = true; continue; }
      const tn = normalizeVN(t.fullName);
      const td = normDob(t.dob);
      if (name && tn === name && dob && td && dob === td) { strong.push({ customer: c, traveler: t, reason: 'name+dob' }); travelerMatched = true; }
    }
    if (!travelerMatched && name && c.type === 'individual' && normalizeVN(c.name) === name) {
      weak.push({ customer: c, reason: 'name' });
    }
  }
  return [...strong, ...weak];
}

/** Lọc khách theo chuỗi tìm (tên/hộ chiếu/mã số thuế/liên hệ). */
export function searchCustomers(customers: Customer[], query: string): Customer[] {
  const q = query.trim();
  if (!q) return customers;
  const nq = normalizeVN(q);
  const pq = normPassport(q);
  return customers.filter((c) => {
    if (nq && normalizeVN(c.name).includes(nq)) return true;
    if (pq && (c.travelers ?? []).some((t) => normPassport(t.passportNo).includes(pq))) return true;
    if (nq && (c.travelers ?? []).some((t) => normalizeVN(t.fullName).includes(nq))) return true;
    if (nq && (c.contacts ?? []).some((ct) => normalizeVN(ct.name).includes(nq) || (ct.phone ?? '').includes(q))) return true;
    if (pq && normPassport(c.taxCode).includes(pq)) return true;
    return false;
  });
}
