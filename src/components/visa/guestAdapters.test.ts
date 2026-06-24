import { describe, expect, it } from 'vitest';
import { applicantToPassenger, passengerToApplicant } from './guestAdapters';
import type { VisaApplicant } from '@/types';

const sample: VisaApplicant = {
  id: 'va1',
  name: 'Nguyễn Văn A',
  nameNoAccent: 'Nguyen Van A',
  gender: 'Nam',
  dob: '1990-01-01',
  passport: 'C1234567',
  passportIssue: '2020-01-01',
  passportExpiry: '2030-01-01',
  countriesVisited: 'Nhật Bản, Hàn Quốc',
  docStatus: 'submitted',
  result: 'passed',
  failReason: '',
  docs: [{ id: 'd1', label: 'Hộ chiếu', checked: true }],
  passportHistory: [{ passport: 'B999', issue: '2010-01-01', expiry: '2020-01-01', replacedAt: '2020-02-01' }],
  note: 'Ghi chú',
  company: 'Viettours',
  phone: '0901234567',
  departurePoint: 'Hà Nội',
  otherFlight: 'VN123 25/11',
  roomType: 'twin',
  roomNo: 'P1',
};

describe('guestAdapters', () => {
  it('round-trips VisaApplicant → Passenger → VisaApplicant without losing data', () => {
    const back = passengerToApplicant(applicantToPassenger(sample));
    expect(back).toEqual(sample);
  });

  it('maps gender and passport correctly to Passenger', () => {
    const p = applicantToPassenger(sample);
    expect(p.gender).toBe('M');
    expect(p.idType).toBe('passport');
    expect(p.idNo).toBe('C1234567');
  });

  it('defaults required visa fields when converting a plain passenger', () => {
    const a = passengerToApplicant({ id: 'p1', name: 'Trần B' });
    expect(a.docStatus).toBe('missing');
    expect(a.result).toBe('pending');
    expect(a.gender).toBe('');
  });

  it('treats female and empty gender symmetrically', () => {
    expect(applicantToPassenger({ ...sample, gender: 'Nữ' }).gender).toBe('F');
    expect(applicantToPassenger({ ...sample, gender: 'Khác' }).gender).toBe('');
    expect(passengerToApplicant({ id: 'x', name: 'X', gender: 'F' }).gender).toBe('Nữ');
  });
});
