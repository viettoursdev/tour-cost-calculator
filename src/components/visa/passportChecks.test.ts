import { describe, expect, it } from 'vitest';
import { passportIssues, hasPassportIssue } from './passportChecks';

describe('passportIssues', () => {
  it('flags a missing passport number', () => {
    expect(passportIssues({}).map((x) => x.text)).toContain('Chưa nhập số hộ chiếu');
  });

  it('flags an expired passport as error', () => {
    const r = passportIssues({ passport: 'C1', passportExpiry: '2000-01-01' });
    expect(r.some((x) => x.level === 'error' && x.text.includes('hết hạn'))).toBe(true);
  });

  it('flags expiry before issue as error', () => {
    const r = passportIssues({ passport: 'C1', passportIssue: '2030-01-01', passportExpiry: '2029-01-01' });
    expect(r.some((x) => x.text.includes('≤ ngày cấp'))).toBe(true);
  });

  it('warns when valid <6 months after departure', () => {
    const r = passportIssues({ passport: 'C1', passportExpiry: '2030-06-01' }, '2030-05-01');
    expect(r.some((x) => x.level === 'warn' && x.text.includes('ngày khởi hành'))).toBe(true);
  });

  it('is clean when passport is well within validity vs departure', () => {
    expect(passportIssues({ passport: 'C1', passportExpiry: '2035-01-01' }, '2030-01-01')).toEqual([]);
    expect(hasPassportIssue({ passport: 'C1', passportExpiry: '2035-01-01' }, '2030-01-01')).toBe(false);
  });

  it('accepts dd/mm/yyyy formats via normalization', () => {
    // Ngày hết hạn 01/06/2030, khởi hành 01/05/2030 → chênh 31 ngày < 6 tháng.
    const r = passportIssues({ passport: 'C1', passportExpiry: '01/06/2030' }, '2030-05-01');
    expect(r.some((x) => x.text.includes('ngày khởi hành'))).toBe(true);
  });
});
