// Module Quản lý kho (Inventory) — Đợt 1: hàng tiêu hao quản lý theo LÔ.
// Tồn KHÔNG lưu rời — suy ra từ lot_lines (qty_remaining). Giá vốn theo FIFO.

/** Kiểu loại sản phẩm: hàng tiêu hao theo lô (Đợt 1) | tài sản theo từng cái (Đợt 2). */
export type InventoryKind = 'consumable' | 'asset';

/** Loại sản phẩm — người quản lý tự thêm; `code` là tiền tố mã (AO, TK…). */
export interface InventoryCategory {
  id: string;
  code: string;
  name: string;
  kind: InventoryKind;
  seq: number;
  note: string;
  createdBy: string;
  createdAt: string;
}

/** Sản phẩm. Mã `code` = `{tiền tố loại}-{NNN}` sinh atomic server-side. */
export interface InventoryItem {
  id: string;
  code: string;
  categoryId: string;
  name: string;
  unit: string;
  sizes: string[];
  minStock: number;
  imageUrl?: string;
  note: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

/** Một dòng size trong lô — đơn vị FIFO. */
export interface InventoryLotLine {
  id: string;
  lotId: string;
  size: string;
  qtyIn: number;
  qtyRemaining: number;
}

/** Một LÔ = 1 màu của 1 sản phẩm (đơn giá nhập chung). `lines` gắn kèm khi nạp. */
export interface InventoryLot {
  id: string;
  code: string;
  itemId: string;
  color: string;
  colorCode: string;
  unitCost: number;
  supplier: string;
  receivedAt: string;
  note: string;
  createdBy: string;
  createdAt: string;
  lines: InventoryLotLine[];
}

export type MovementType = 'in' | 'out' | 'adjust';

/** Một dòng sổ nhập/xuất/điều chỉnh. */
export interface InventoryMovement {
  id: string;
  itemId: string;
  lotId?: string;
  lotLineId?: string;
  color: string;
  size: string;
  type: MovementType;
  qty: number;
  unitCost: number;
  reason: string;
  ref: string;
  occurredAt: string;
  createdBy: string;
  createdAt: string;
}

/** Tồn hiện tại theo (sản phẩm, màu, size) — suy ra ở client từ lot_lines. */
export interface StockRow {
  itemId: string;
  color: string;
  size: string;
  onHand: number;
  value: number; // Σ qtyRemaining × đơn giá lô (FIFO)
}

/** Một dòng size để nhập lô (form). */
export interface ReceiveLine {
  size: string;
  qty: number;
}

// ── Phân hệ B: tài sản theo từng cái ───────────────────────────────────────────
export type AssetStatus = 'available' | 'in_use' | 'maintenance' | 'retired' | 'lost';
export type AssetAction = 'checkout' | 'checkin' | 'maintenance' | 'retire' | 'status';

/** Một CÁI thiết bị/tài sản vật lý (đơn vị riêng của một model = inventory_item kind='asset'). */
export interface InventoryAsset {
  id: string;
  code: string;
  itemId: string;
  name: string;
  serial: string;
  purchaseCost: number;
  purchasedAt?: string;
  status: AssetStatus;
  holder: string;
  location: string;
  condition: string;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

/** Nhật ký một thao tác trên tài sản. */
export interface InventoryAssetLog {
  id: string;
  assetId: string;
  action: AssetAction;
  fromStatus: string;
  toStatus: string;
  holder: string;
  reason: string;
  ref: string;
  occurredAt: string;
  createdBy: string;
  createdAt: string;
}
