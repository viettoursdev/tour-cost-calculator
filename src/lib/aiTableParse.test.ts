import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));
import { extractArray, coerceRows, buildTablePrompt } from './aiTableParse';

const cols = [
  { key: 'name', label: 'Tên NCC' },
  { key: 'phone', label: 'Điện thoại', aliases: ['sdt', 'tel'] },
];

describe('extractArray', () => {
  it('bóc mảng JSON kể cả có fence/chữ quanh', () => {
    expect(extractArray('Kết quả:\n```json\n[{"name":"A"}]\n```')).toEqual([{ name: 'A' }]);
  });
  it('null nếu không phải mảng', () => {
    expect(extractArray('không có gì')).toBeNull();
    expect(extractArray('{"name":"A"}')).toBeNull();
  });
});

describe('coerceRows', () => {
  it('chỉ giữ khoá cột, ép string, bỏ dòng rỗng', () => {
    const rows = coerceRows(
      [{ name: 'KS A', phone: 905123, extra: 'bỏ' }, { name: '', phone: '' }, { name: ' B ' }],
      cols,
    );
    expect(rows).toEqual([{ name: 'KS A', phone: '905123' }, { name: 'B', phone: '' }]);
  });
});

describe('buildTablePrompt', () => {
  it('liệt kê khoá + alias', () => {
    const p = buildTablePrompt(cols);
    expect(p).toContain('"name": Tên NCC');
    expect(p).toContain('"phone": Điện thoại (vd: sdt, tel)');
  });
});
