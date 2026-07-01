/**
 * Quan hệ giữa các khách trong đoàn (cha/mẹ, con, vợ/chồng, ông/bà…) + quy tắc
 * trẻ vị thành niên: bé <14 tuổi (tính theo NGÀY KHỞI HÀNH) phải đi cùng cha/mẹ;
 * nếu không, cần GIẤY UỶ QUYỀN cho người thân đưa đi.
 */
import { normDob } from './applicantMatch';
import type { GuestRelation, GuestRelationType } from '@/types';

/** Ngưỡng tuổi trẻ vị thành niên cần đi cùng cha/mẹ hoặc giấy uỷ quyền. */
export const MINOR_AGE = 14;

export const RELATION_TYPES: { key: GuestRelationType; label: string }[] = [
  { key: 'spouse', label: 'Vợ/Chồng' },
  { key: 'parent', label: 'Cha/Mẹ' },
  { key: 'child', label: 'Con' },
  { key: 'grandparent', label: 'Ông/Bà' },
  { key: 'grandchild', label: 'Cháu' },
  { key: 'sibling', label: 'Anh/Chị/Em' },
  { key: 'relative', label: 'Người thân khác' },
];

export const RELATION_LABEL: Record<GuestRelationType, string> =
  Object.fromEntries(RELATION_TYPES.map((r) => [r.key, r.label])) as Record<GuestRelationType, string>;

/** Quan hệ đối xứng: nếu Y là <type> của X thì X là <inverse> của Y. */
export const INVERSE_RELATION: Record<GuestRelationType, GuestRelationType> = {
  spouse: 'spouse',
  parent: 'child',
  child: 'parent',
  grandparent: 'grandchild',
  grandchild: 'grandparent',
  sibling: 'sibling',
  relative: 'relative',
};

export interface RelatableGuest {
  id: string;
  dob?: string;
  relations?: GuestRelation[];
  guardianAuthReady?: boolean;
}

/** Tuổi (năm tròn) tại một ngày mốc. Trả null nếu thiếu/không đọc được ngày. */
export function ageAtDate(dob: string | undefined, atISO: string | null | undefined): number | null {
  const d = normDob(dob);
  const at = normDob(atISO);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{4}-\d{2}-\d{2}$/.test(at)) return null;
  const [by, bm, bd] = d.split('-').map(Number);
  const [ay, am, ad] = at.split('-').map(Number);
  let age = ay - by;
  if (am < bm || (am === bm && ad < bd)) age--;
  return age;
}

/** Bé có cha/mẹ (quan hệ 'parent') nào KHÁC trong danh sách đoàn không. */
export function hasParentInGroup(guest: RelatableGuest, group: RelatableGuest[]): boolean {
  const ids = new Set(group.map((g) => g.id));
  return (guest.relations ?? []).some((r) => r.type === 'parent' && r.toId !== guest.id && ids.has(r.toId));
}

export interface MinorStatus {
  age: number | null;
  isMinor: boolean;
  withParent: boolean;
  /** Cần giấy uỷ quyền: bé <14, không đi cùng cha/mẹ, chưa đánh dấu đã có giấy. */
  needsAuth: boolean;
}

export function minorGuardianStatus(
  guest: RelatableGuest, group: RelatableGuest[], departureDate: string | null | undefined,
): MinorStatus {
  const age = ageAtDate(guest.dob, departureDate);
  const isMinor = age != null && age < MINOR_AGE;
  const withParent = isMinor && hasParentInGroup(guest, group);
  const needsAuth = isMinor && !withParent && !guest.guardianAuthReady;
  return { age, isMinor, withParent, needsAuth };
}

function upsertRel(rels: GuestRelation[] | undefined, entry: GuestRelation): GuestRelation[] {
  return [...(rels ?? []).filter((r) => r.toId !== entry.toId), entry];
}

/** Thêm quan hệ "toId là <type> của fromId" — tự thêm chiều ngược lên toId. */
export function addRelation<T extends RelatableGuest>(
  list: T[], fromId: string, toId: string, type: GuestRelationType,
): T[] {
  if (fromId === toId) return list;
  const inverse = INVERSE_RELATION[type];
  return list.map((g) => {
    if (g.id === fromId) return { ...g, relations: upsertRel(g.relations, { toId, type }) };
    if (g.id === toId) return { ...g, relations: upsertRel(g.relations, { toId: fromId, type: inverse }) };
    return g;
  });
}

/** Gỡ quan hệ giữa hai khách (cả hai chiều). */
export function removeRelation<T extends RelatableGuest>(list: T[], aId: string, bId: string): T[] {
  return list.map((g) => {
    if (g.id === aId) return { ...g, relations: (g.relations ?? []).filter((r) => r.toId !== bId) };
    if (g.id === bId) return { ...g, relations: (g.relations ?? []).filter((r) => r.toId !== aId) };
    return g;
  });
}
