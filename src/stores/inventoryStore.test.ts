import { describe, it, expect } from 'vitest';
import { colorToCode, computeStock, itemOnHand, inventoryCostForTour, computeNXT } from './inventoryStore';
import type { InventoryLot, InventoryMovement } from '@/types/inventory';

const mv = (over: Partial<InventoryMovement> & { type: InventoryMovement['type']; qty: number }): InventoryMovement => ({
  id: Math.random().toString(36).slice(2), itemId: 'i1', color: '', size: '', unitCost: 0,
  reason: '', ref: '', occurredAt: '2026-06-10', createdBy: '', createdAt: '', ...over,
});

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

describe('inventoryCostForTour', () => {
  it('gộp giá vốn các lần xuất gắn tour (theo tourCode hoặc tourProfileId)', () => {
    const moves: InventoryMovement[] = [
      mv({ type: 'out', qty: 3, unitCost: 100, tourCode: 'T1' }),
      mv({ type: 'out', qty: 2, unitCost: 120, tourProfileId: 'tp1' }),
      mv({ type: 'out', qty: 5, unitCost: 100, tourCode: 'T2' }),   // tour khác
      mv({ type: 'in', qty: 9, unitCost: 100, tourCode: 'T1' }),    // nhập, không tính
    ];
    expect(inventoryCostForTour(moves, { tourCode: 'T1' })).toBe(300);
    expect(inventoryCostForTour(moves, { tourProfileId: 'tp1' })).toBe(240);
  });
});

describe('computeNXT', () => {
  it('tính tồn đầu/nhập/xuất/tồn cuối theo kỳ', () => {
    const moves: InventoryMovement[] = [
      mv({ type: 'in', qty: 10, unitCost: 100, occurredAt: '2026-05-01' }), // trước kỳ → đầu kỳ
      mv({ type: 'out', qty: 4, unitCost: 100, occurredAt: '2026-05-20' }), // trước kỳ → đầu kỳ
      mv({ type: 'in', qty: 8, unitCost: 110, occurredAt: '2026-06-05' }),  // trong kỳ
      mv({ type: 'out', qty: 5, unitCost: 100, occurredAt: '2026-06-15' }), // trong kỳ
    ];
    const [r] = computeNXT(moves, '2026-06-01', '2026-06-30');
    expect(r.opening).toBe(6);    // 10 − 4
    expect(r.inQty).toBe(8);
    expect(r.outQty).toBe(5);
    expect(r.closing).toBe(9);    // 6 + 8 − 5
    expect(r.inValue).toBe(880);  // 8 × 110
    expect(r.outValue).toBe(500); // 5 × 100
  });
});
