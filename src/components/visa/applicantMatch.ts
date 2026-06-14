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

// Các ô vô hướng được điền-bù khi gộp (giữ giá trị của base nếu đã có).
const FILL_FIELDS: (keyof VisaApplicant)[] = [
  'name', 'nameNoAccent', 'gender', 'dob', 'passport', 'passportIssue',
  'passportExpiry', 'countriesVisited', 'failReason', 'note',
];

function isEmpty(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

/**
 * Gộp `extra` vào `base`: GIỮ base làm gốc, chỉ điền các ô đang trống của base
 * bằng giá trị từ extra. Checklist/lịch sử hộ chiếu giữ của base (bù nếu base thiếu).
 */
export function mergeApplicant(base: VisaApplicant, extra: VisaApplicant): VisaApplicant {
  const out: VisaApplicant = { ...base };
  for (const f of FILL_FIELDS) {
    if (isEmpty(out[f]) && !isEmpty(extra[f])) {
      (out as unknown as Record<string, unknown>)[f] = extra[f];
    }
  }
  if ((!out.docs || out.docs.length === 0) && extra.docs?.length) out.docs = extra.docs.map((d) => ({ ...d }));
  if ((!out.passportHistory || out.passportHistory.length === 0) && extra.passportHistory?.length) {
    out.passportHistory = extra.passportHistory.map((p) => ({ ...p }));
  }
  return out;
}

/**
 * Loại khách trùng trong danh sách: giữ bản đầu tiên, GỘP thông tin từ các bản
 * trùng (theo {@link sameGuest}) vào nó. Trả về danh sách mới + số bản đã gộp/bỏ.
 */
export function dedupeApplicants(list: VisaApplicant[]): { list: VisaApplicant[]; removed: number } {
  const kept: VisaApplicant[] = [];
  let removed = 0;
  for (const a of list) {
    const idx = kept.findIndex((k) => sameGuest(guestKeyOf(k), guestKeyOf(a)));
    if (idx === -1) {
      kept.push(a);
    } else {
      kept[idx] = mergeApplicant(kept[idx], a);
      removed++;
    }
  }
  return { list: kept, removed };
}

/**
 * Gộp danh sách `incoming` (vd từ Excel) vào `current`: bản trùng được gộp vào
 * bản hiện có, bản mới được thêm. Trả về danh sách + số thêm mới & số gộp.
 */
export function mergeIncoming(
  current: VisaApplicant[],
  incoming: VisaApplicant[],
): { list: VisaApplicant[]; added: number; merged: number } {
  const out = [...current];
  let added = 0;
  let merged = 0;
  for (const a of incoming) {
    const idx = out.findIndex((k) => sameGuest(guestKeyOf(k), guestKeyOf(a)));
    if (idx === -1) {
      out.push(a);
      added++;
    } else {
      out[idx] = mergeApplicant(out[idx], a);
      merged++;
    }
  }
  return { list: out, added, merged };
}
