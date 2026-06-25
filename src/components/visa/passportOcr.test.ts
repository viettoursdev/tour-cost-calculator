import { describe, it, expect } from 'vitest';
import { parsePassportJson, passportToPassenger } from './passportOcr';

describe('parsePassportJson', () => {
  it('tách JSON kể cả khi có rào ```json và chữ thừa', () => {
    const f = parsePassportJson('Đây là kết quả:\n```json\n{"fullName":"NGUYEN VAN A","dob":"1990-05-01","sex":"M","passportNo":"C1234567","issueDate":"2020-01-01","expiryDate":"2030-01-01","nationality":"VIETNAM"}\n```');
    expect(f.fullName).toBe('NGUYEN VAN A');
    expect(f.sex).toBe('M');
    expect(f.passportNo).toBe('C1234567');
    expect(f.expiryDate).toBe('2030-01-01');
  });

  it('chuẩn hoá sex + chịu được text rác', () => {
    expect(parsePassportJson('{"sex":"female"}').sex).toBe('F');
    expect(parsePassportJson('không đọc được').fullName).toBe('');
  });

  it('passportToPassenger map đúng + idType khi có số HC', () => {
    const p = passportToPassenger({ fullName: 'TRAN THI B', dob: '1988-02-03', sex: 'F', passportNo: 'B999', issueDate: '2021-03-03', expiryDate: '2031-03-03', nationality: 'VIETNAM' });
    expect(p.gender).toBe('F');
    expect(p.idType).toBe('passport');
    expect(p.idNo).toBe('B999');
    expect(p.nameNoAccent).toBe('TRAN THI B');
    expect(passportToPassenger({ fullName: '', dob: '', sex: '', passportNo: '', issueDate: '', expiryDate: '', nationality: '' }).idType).toBe('');
  });
});
