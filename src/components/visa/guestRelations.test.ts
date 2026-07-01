import { describe, expect, it } from 'vitest';
import {
  addRelation, ageAtDate, hasParentInGroup, minorGuardianStatus, removeRelation, type RelatableGuest,
} from './guestRelations';

describe('ageAtDate', () => {
  it('computes full years, accounting for month/day', () => {
    expect(ageAtDate('2015-06-01', '2029-05-01')).toBe(13); // chưa tới sinh nhật
    expect(ageAtDate('2015-06-01', '2029-06-01')).toBe(14);
    expect(ageAtDate('2010-01-01', '2030-01-01')).toBe(20);
  });
  it('handles dd/mm/yyyy and missing input', () => {
    expect(ageAtDate('01/06/2015', '2030-06-01')).toBe(15);
    expect(ageAtDate(undefined, '2030-01-01')).toBeNull();
    expect(ageAtDate('2015-06-01', null)).toBeNull();
  });
});

describe('addRelation / removeRelation (symmetric)', () => {
  const base: RelatableGuest[] = [{ id: 'child' }, { id: 'dad' }];
  it('adds inverse on the other guest', () => {
    const r = addRelation(base, 'child', 'dad', 'parent');
    expect(r.find((g) => g.id === 'child')!.relations).toEqual([{ toId: 'dad', type: 'parent' }]);
    expect(r.find((g) => g.id === 'dad')!.relations).toEqual([{ toId: 'child', type: 'child' }]);
  });
  it('spouse is its own inverse; replaces existing relation to same person', () => {
    let r = addRelation(base, 'child', 'dad', 'spouse');
    r = addRelation(r, 'child', 'dad', 'parent'); // đổi lại loại quan hệ
    expect(r.find((g) => g.id === 'child')!.relations).toEqual([{ toId: 'dad', type: 'parent' }]);
  });
  it('ignores self-relation', () => {
    expect(addRelation(base, 'child', 'child', 'sibling')).toEqual(base);
  });
  it('removes both sides', () => {
    const r = removeRelation(addRelation(base, 'child', 'dad', 'parent'), 'child', 'dad');
    expect(r.find((g) => g.id === 'child')!.relations).toEqual([]);
    expect(r.find((g) => g.id === 'dad')!.relations).toEqual([]);
  });
});

describe('minorGuardianStatus', () => {
  const dep = '2030-06-01';
  it('minor with a parent in group → ok, no auth needed', () => {
    let list: RelatableGuest[] = [{ id: 'kid', dob: '2020-01-01' }, { id: 'mom', dob: '1990-01-01' }];
    list = addRelation(list, 'kid', 'mom', 'parent');
    const s = minorGuardianStatus(list[0], list, dep);
    expect(s.isMinor).toBe(true);
    expect(s.withParent).toBe(true);
    expect(s.needsAuth).toBe(false);
  });
  it('minor without a parent → needs authorization', () => {
    const list: RelatableGuest[] = [{ id: 'kid', dob: '2020-01-01' }, { id: 'gran', dob: '1950-01-01' }];
    const s = minorGuardianStatus(list[0], list, dep);
    expect(s.needsAuth).toBe(true);
  });
  it('guardianAuthReady clears the requirement', () => {
    const list: RelatableGuest[] = [{ id: 'kid', dob: '2020-01-01', guardianAuthReady: true }];
    expect(minorGuardianStatus(list[0], list, dep).needsAuth).toBe(false);
  });
  it('turns 14 by departure → not a minor', () => {
    const list: RelatableGuest[] = [{ id: 'teen', dob: '2016-06-01' }];
    expect(minorGuardianStatus(list[0], list, dep).isMinor).toBe(false);
  });
  it('hasParentInGroup ignores a parent not present in the list', () => {
    const guest: RelatableGuest = { id: 'kid', relations: [{ toId: 'ghost', type: 'parent' }] };
    expect(hasParentInGroup(guest, [guest])).toBe(false);
  });
});
