import { normalizeVN } from '@/lib/search';
import type { VisaApplicant } from '@/types';

/** Khoá nhận diện một khách (đủ để so khớp xuyên dự án). */
export interface GuestKey {
  name?: string;
  passport?: string;
  dob?: string;
}

/** Chuẩn hoá số hộ chiếu: bỏ khoảng trắng, in hoa. */
export function normPassport(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, '').toUpperCase().trim();
}

/**
 * Hai mục có phải cùng một người không.
 * Quy tắc: trùng số hộ chiếu (khi cả hai có) ⇒ cùng người; hoặc trùng tên (không
 * dấu) VÀ trùng ngày sinh (khi cả hai có) ⇒ cùng người.
 */
export function sameGuest(a: GuestKey, b: GuestKey): boolean {
  const pa = normPassport(a.passport);
  const pb = normPassport(b.passport);
  if (pa && pb) return pa === pb;

  const na = normalizeVN(a.name);
  const nb = normalizeVN(b.name);
  if (!na || na !== nb) return false;
  const da = (a.dob ?? '').trim();
  const db = (b.dob ?? '').trim();
  return !!da && da === db;
}

/** Khách có khớp với chuỗi tìm (theo tên không dấu hoặc số hộ chiếu) không. */
export function matchesGuestQuery(a: GuestKey, query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  const nq = normalizeVN(q);
  if (nq && normalizeVN(a.name).includes(nq)) return true;
  const pq = normPassport(q);
  return !!pq && normPassport(a.passport).includes(pq);
}

/** Trích GuestKey từ một applicant. */
export function guestKeyOf(a: VisaApplicant): GuestKey {
  return { name: a.name, passport: a.passport, dob: a.dob };
}
