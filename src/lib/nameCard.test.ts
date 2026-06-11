import { describe, it, expect } from 'vitest';
import { parseLooseJson, regexFallback } from './nameCard';

describe('parseLooseJson', () => {
  it('extracts a JSON block embedded in chatty text', () => {
    const reply = 'Đây là kết quả:\n```json\n{"company":"ACME","name":"An","email":"an@acme.com"}\n```';
    const f = parseLooseJson(reply);
    expect(f.company).toBe('ACME');
    expect(f.name).toBe('An');
    expect(f.email).toBe('an@acme.com');
  });

  it('trims values and ignores non-string keys', () => {
    const f = parseLooseJson('{"name":"  Bình  ","phone":12345,"position":"Sales"}');
    expect(f.name).toBe('Bình');
    expect(f.phone).toBe(''); // non-string ignored
    expect(f.position).toBe('Sales');
  });

  it('returns empty object when no JSON present', () => {
    expect(parseLooseJson('không có json ở đây')).toEqual({});
  });

  it('returns empty object on malformed JSON', () => {
    expect(parseLooseJson('{ broken: , }')).toEqual({});
  });
});

describe('regexFallback', () => {
  it('pulls email and phone from raw OCR text', () => {
    const raw = 'Nguyen Van A\nTour Manager\nTel: +84 908 125 965\nEmail: a.nguyen@viettours.com.vn';
    const f = regexFallback(raw);
    expect(f.email).toBe('a.nguyen@viettours.com.vn');
    expect(f.phone).toContain('908');
  });

  it('detects tax code after an MST label', () => {
    expect(regexFallback('MST: 0312345678').taxCode).toBe('0312345678');
    expect(regexFallback('Mã số thuế 0101243150-001').taxCode).toBe('0101243150-001');
  });

  it('returns empty strings when nothing matches', () => {
    expect(regexFallback('chỉ là chữ thường')).toEqual({ email: '', phone: '', taxCode: '' });
  });
});
