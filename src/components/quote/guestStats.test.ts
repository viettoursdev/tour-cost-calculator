import { describe, expect, it } from 'vitest';
import { summarizeGuests } from './guestStats';
import type { Passenger } from '@/types';

const p = (over: Partial<Passenger>): Passenger => ({ id: Math.random().toString(36), name: 'X', ...over });

describe('summarizeGuests', () => {
  it('counts genders', () => {
    const s = summarizeGuests([p({ gender: 'M' }), p({ gender: 'F' }), p({ gender: 'F' }), p({})]);
    expect(s.total).toBe(4);
    expect(s.male).toBe(1);
    expect(s.female).toBe(2);
    expect(s.unspecifiedGender).toBe(1);
  });

  it('counts a shared twin room as one room with two guests', () => {
    const s = summarizeGuests([
      p({ roomType: 'twin', roomNo: 'P1' }),
      p({ roomType: 'twin', roomNo: 'P1' }),
    ]);
    expect(s.guestsByRoom.twin).toBe(2);
    expect(s.roomsByRoom.twin).toBe(1);
    expect(s.totalRooms).toBe(1);
    expect(s.unassigned).toBe(0);
  });

  it('treats typed guests without a room number as their own room', () => {
    const s = summarizeGuests([
      p({ roomType: 'single' }),
      p({ roomType: 'vip' }),
      p({ roomType: 'vip', roomNo: 'V2' }),
    ]);
    expect(s.roomsByRoom.single).toBe(1);
    expect(s.roomsByRoom.vip).toBe(2);
    expect(s.totalRooms).toBe(3);
  });

  it('flags unassigned guests (no type, no room)', () => {
    const s = summarizeGuests([p({}), p({ roomNo: '  ' }), p({ roomType: 'double', roomNo: 'D1' })]);
    expect(s.unassigned).toBe(2);
    expect(s.totalRooms).toBe(1);
  });
});
