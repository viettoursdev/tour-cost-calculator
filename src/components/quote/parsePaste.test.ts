import { describe, it, expect } from 'vitest';
import { parsePasteGrid } from './parsePaste';

describe('parsePasteGrid', () => {
  it('không tiêu đề → thứ tự mặc định', () => {
    const r = parsePasteGrid('Xe 45 chỗ\t5500000\t/xe\t2\tMáy lạnh\nHDV\t1200000');
    expect(r.headerDetected).toBe(false);
    expect(r.validCount).toBe(2);
    expect(r.rows[0].item).toMatchObject({ name: 'Xe 45 chỗ', price: 5500000, unit: '/xe', times: 2, note: 'Máy lạnh' });
  });

  it('tự nhận & bỏ dòng tiêu đề, ánh xạ theo tên cột', () => {
    const text = 'Tên\tĐơn giá\tĐơn vị\nGhế VIP\t1tr5\t/vé';
    const r = parsePasteGrid(text);
    expect(r.headerDetected).toBe(true);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].item).toMatchObject({ name: 'Ghế VIP', price: 1500000, unit: '/vé' });
  });

  it('ánh xạ cột theo vị trí từ tiêu đề (đảo thứ tự)', () => {
    const text = 'Đơn giá\tTên\n2000000\tVé tham quan';
    const r = parsePasteGrid(text);
    expect(r.headerDetected).toBe(true);
    expect(r.rows[0].item).toMatchObject({ name: 'Vé tham quan', price: 2000000 });
  });

  it('đánh dấu dòng thiếu tên', () => {
    const r = parsePasteGrid('\t5000000\nXe\t1000000');
    expect(r.rows[0].ok).toBe(false);
    expect(r.rows[0].reason).toBe('Thiếu tên');
    expect(r.validCount).toBe(1);
  });

  it('bỏ dòng trống hoàn toàn', () => {
    const r = parsePasteGrid('Xe\t1000\n\n\nHDV\t2000');
    expect(r.rows).toHaveLength(2);
  });
});
