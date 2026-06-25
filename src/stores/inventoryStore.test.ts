import { describe, it, expect } from 'vitest';
import { colorToCode, computeStock, itemOnHand } from './inventoryStore';
import type { InventoryLot } from '@/types/inventory';

const lot = (over: Partial<InventoryLot> & { itemId: string; color: string; unitCost: number; lines: InventoryLot['lines'] }): InventoryLot => ({
  id: 'lot1', code: 'X', colorCode: '', supplier: '', receivedAt: '2026-01-01', note: '',
  createdBy: '', createdAt: '', ...over,
});

describe('colorToCode', () => {
  it('bỏ dấu + in hoa tiếng Việt', () => {
    expect(colorToCode('Đỏ')).toBe('DO');
    expect(colorToCode('Xanh lá')).toBe('XANHLA');
    expect(colorToCode('Trắng')).toBe('TRANG');
    expect(colorToCode('')).toBe('');
  });
});

describe('computeStock', () => {
  it('gộp tồn theo màu+size và tính giá trị theo đơn giá lô', () => {
    const lots: InventoryLot[] = [
      lot({ itemId: 'i1', color: 'Đỏ', unitCost: 100, lines: [
        { id: 'a', lotId: 'lot1', size: 'M', qtyIn: 10, qtyRemaining: 6 },
        { id: 'b', lotId: 'lot1', size: 'L', qtyIn: 5, qtyRemaining: 5 },
      ] }),
      lot({ id: 'lot2', itemId: 'i1', color: 'Đỏ', unitCost: 120, lines: [
        { id: 'c', lotId: 'lot2', size: 'M', qtyIn: 4, qtyRemaining: 4 },
      ] }),
    ];
    const stock = computeStock(lots);
    const redM = stock.find((s) => s.color === 'Đỏ' && s.size === 'M')!;
    expect(redM.onHand).toBe(10);               // 6 + 4
    expect(redM.value).toBe(6 * 100 + 4 * 120); // FIFO: giá theo từng lô
    expect(itemOnHand('i1', stock)).toBe(15);   // 10 (M) + 5 (L)
  });

  it('bỏ qua dòng đã hết tồn', () => {
    const lots: InventoryLot[] = [lot({ itemId: 'i2', color: 'X', unitCost: 50, lines: [
      { id: 'z', lotId: 'lot1', size: 'S', qtyIn: 3, qtyRemaining: 0 },
    ] })];
    expect(computeStock(lots)).toHaveLength(0);
    expect(itemOnHand('i2', computeStock(lots))).toBe(0);
  });
});
