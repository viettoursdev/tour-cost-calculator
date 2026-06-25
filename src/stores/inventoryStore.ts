import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  sbSubscribeInventory, sbUpsertInventoryCategory, sbDeleteInventoryCategory,
  sbNextItemCode, sbUpsertInventoryItem, sbDeleteInventoryItem,
  sbReceiveLot, sbIssueStock, sbAdjustStock,
  sbNextAssetCode, sbUpsertAsset, sbDeleteAsset, sbAssetAction,
  type InventorySnapshot,
} from '@/lib/supabase';
import { useAuthStore } from './authStore';
import type { Unsubscribe } from '@/lib/supabase/helpers';
import type {
  InventoryCategory, InventoryItem, InventoryLot, StockRow, ReceiveLine,
  InventoryAsset, InventoryAssetLog, AssetStatus, AssetAction,
} from '@/types/inventory';

export const newInvId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Mã màu trong code SP: bỏ dấu, in hoa, chỉ A-Z0-9. "Đỏ" → "DO", "Xanh lá" → "XANHLA". */
export function colorToCode(color: string): string {
  return (color || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'D')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Tồn hiện tại theo (sản phẩm, màu, size) — gộp qty_remaining, giá trị theo đơn giá lô (FIFO). */
export function computeStock(lots: InventoryLot[]): StockRow[] {
  const map = new Map<string, StockRow>();
  for (const lot of lots) {
    for (const ll of lot.lines) {
      if (ll.qtyRemaining <= 0) continue;
      const key = `${lot.itemId}|${lot.color}|${ll.size}`;
      const row = map.get(key) ?? { itemId: lot.itemId, color: lot.color, size: ll.size, onHand: 0, value: 0 };
      row.onHand += ll.qtyRemaining;
      row.value += ll.qtyRemaining * lot.unitCost;
      map.set(key, row);
    }
  }
  return Array.from(map.values());
}

/** Tổng tồn (số lượng) của một sản phẩm trên mọi màu/size. */
export function itemOnHand(itemId: string, stock: StockRow[]): number {
  return stock.filter((s) => s.itemId === itemId).reduce((a, s) => a + s.onHand, 0);
}

/** Tổng giá vốn (FIFO) hàng đã XUẤT gắn một tour — dùng đưa vào Quyết toán. */
export function inventoryCostForTour(
  movements: import('@/types/inventory').InventoryMovement[],
  opts: { tourProfileId?: string; tourCode?: string },
): number {
  return movements
    .filter((m) => m.type === 'out' && (
      (opts.tourProfileId && m.tourProfileId === opts.tourProfileId) ||
      (opts.tourCode && m.tourCode === opts.tourCode)
    ))
    .reduce((a, m) => a + m.qty * m.unitCost, 0);
}

/** Một dòng báo cáo Nhập–Xuất–Tồn theo kỳ (tính trên dòng IN/OUT, không gồm điều chỉnh). */
export interface NXTRow {
  itemId: string;
  opening: number;   // tồn đầu kỳ (số lượng)
  inQty: number;     // nhập trong kỳ
  outQty: number;    // xuất trong kỳ
  closing: number;   // tồn cuối kỳ = đầu + nhập − xuất
  inValue: number;   // giá trị nhập trong kỳ
  outValue: number;  // giá vốn xuất trong kỳ (FIFO)
}

/** Báo cáo NXT theo kỳ [from, to] (YYYY-MM-DD, so theo ngày occurredAt). */
export function computeNXT(
  movements: import('@/types/inventory').InventoryMovement[],
  from: string,
  to: string,
): NXTRow[] {
  const map = new Map<string, NXTRow>();
  const get = (id: string) =>
    map.get(id) ?? map.set(id, { itemId: id, opening: 0, inQty: 0, outQty: 0, closing: 0, inValue: 0, outValue: 0 }).get(id)!;
  for (const m of movements) {
    if (m.type === 'adjust') continue;
    const day = (m.occurredAt || '').slice(0, 10);
    const sign = m.type === 'in' ? 1 : -1;
    const row = get(m.itemId);
    if (day < from) {
      row.opening += sign * m.qty;
    } else if (day <= to) {
      if (m.type === 'in') { row.inQty += m.qty; row.inValue += m.qty * m.unitCost; }
      else { row.outQty += m.qty; row.outValue += m.qty * m.unitCost; }
    }
  }
  for (const row of map.values()) row.closing = row.opening + row.inQty - row.outQty;
  return Array.from(map.values()).filter((r) => r.opening || r.inQty || r.outQty);
}

type State = {
  categories: InventoryCategory[];
  items: InventoryItem[];
  lots: InventoryLot[];
  movements: InventorySnapshot['movements'];
  assets: InventoryAsset[];
  assetLogs: InventoryAssetLog[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  saveCategory: (c: Partial<InventoryCategory> & { name: string; code: string }) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  saveItem: (it: Partial<InventoryItem> & { categoryId: string; name: string }) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  receiveLot: (args: {
    itemId: string; color: string; unitCost: number; supplier: string;
    receivedAt: string; note: string; lines: ReceiveLine[];
  }) => Promise<void>;
  issue: (args: { itemId: string; color: string; size: string; qty: number; reason: string; ref: string; occurredAt: string; tourProfileId?: string; tourCode?: string }) => Promise<void>;
  adjust: (lotLineId: string, newQty: number, reason: string) => Promise<void>;
  saveAsset: (a: Partial<InventoryAsset> & { itemId: string }) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  assetAction: (args: { assetId: string; action: AssetAction; toStatus: AssetStatus; holder: string; reason: string; ref: string; occurredAt: string; tourProfileId?: string; tourCode?: string }) => Promise<void>;
};

export const useInventoryStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    categories: [],
    items: [],
    lots: [],
    movements: [],
    assets: [],
    assetLogs: [],
    loading: true,
    syncing: false,

    init: () => {
      set({ loading: true });
      return sbSubscribeInventory((snap) => set({
        categories: snap.categories, items: snap.items, lots: snap.lots,
        movements: snap.movements, assets: snap.assets, assetLogs: snap.assetLogs, loading: false,
      }));
    },

    saveCategory: async (c) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const existing = c.id ? get().categories.find((x) => x.id === c.id) : undefined;
      const cat: InventoryCategory = {
        id: c.id || newInvId('cat_'),
        code: c.code.trim().toUpperCase(),
        name: c.name.trim(),
        kind: c.kind ?? existing?.kind ?? 'consumable',
        seq: existing?.seq ?? 0,
        note: c.note ?? existing?.note ?? '',
        createdBy: existing?.createdBy ?? u.name,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      set({ syncing: true });
      try { await sbUpsertInventoryCategory(cat); }
      catch (e) { window.alert('❌ Lỗi lưu loại sản phẩm: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    deleteCategory: async (id) => {
      set({ syncing: true });
      try { await sbDeleteInventoryCategory(id); }
      catch (e) { window.alert('❌ Không xoá được loại (có thể còn sản phẩm): ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    saveItem: async (it) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const existing = it.id ? get().items.find((x) => x.id === it.id) : undefined;
      set({ syncing: true });
      try {
        const code = existing?.code ?? (it.code || await sbNextItemCode(it.categoryId));
        const item: InventoryItem = {
          id: it.id || newInvId('inv_'),
          code,
          categoryId: it.categoryId,
          name: (it.name ?? '').trim(),
          unit: it.unit ?? existing?.unit ?? 'cái',
          sizes: it.sizes ?? existing?.sizes ?? [],
          minStock: it.minStock ?? existing?.minStock ?? 0,
          imageUrl: it.imageUrl ?? existing?.imageUrl,
          note: it.note ?? existing?.note ?? '',
          active: it.active ?? existing?.active ?? true,
          createdBy: existing?.createdBy ?? u.name,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        };
        await sbUpsertInventoryItem(item, { name: u.name, role: u.role });
      } catch (e) { window.alert('❌ Lỗi lưu sản phẩm: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    deleteItem: async (id) => {
      set({ syncing: true });
      try { await sbDeleteInventoryItem(id); }
      catch (e) { window.alert('❌ Lỗi xoá sản phẩm: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    receiveLot: async (args) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      set({ syncing: true });
      try {
        await sbReceiveLot({
          itemId: args.itemId, color: args.color.trim(), colorCode: colorToCode(args.color),
          unitCost: args.unitCost, supplier: args.supplier, receivedAt: args.receivedAt,
          note: args.note, lines: args.lines.filter((l) => l.qty > 0), by: u.name,
        });
      } catch (e) { window.alert('❌ Lỗi nhập lô: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    issue: async (args) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      set({ syncing: true });
      try {
        await sbIssueStock({ ...args, by: u.name });
      } catch (e) { window.alert('❌ ' + (e as Error).message); throw e; }
      finally { set({ syncing: false }); }
    },

    adjust: async (lotLineId, newQty, reason) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      set({ syncing: true });
      try { await sbAdjustStock(lotLineId, newQty, reason, u.name); }
      catch (e) { window.alert('❌ Lỗi điều chỉnh tồn: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    saveAsset: async (a) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const existing = a.id ? get().assets.find((x) => x.id === a.id) : undefined;
      set({ syncing: true });
      try {
        const code = existing?.code ?? (a.code || await sbNextAssetCode(a.itemId));
        const asset: InventoryAsset = {
          id: a.id || newInvId('ast_'),
          code,
          itemId: a.itemId,
          name: (a.name ?? existing?.name ?? '').trim(),
          serial: a.serial ?? existing?.serial ?? '',
          purchaseCost: a.purchaseCost ?? existing?.purchaseCost ?? 0,
          purchasedAt: a.purchasedAt ?? existing?.purchasedAt,
          status: a.status ?? existing?.status ?? 'available',
          holder: a.holder ?? existing?.holder ?? '',
          location: a.location ?? existing?.location ?? '',
          condition: a.condition ?? existing?.condition ?? '',
          note: a.note ?? existing?.note ?? '',
          createdBy: existing?.createdBy ?? u.name,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        };
        await sbUpsertAsset(asset, { name: u.name, role: u.role });
      } catch (e) { window.alert('❌ Lỗi lưu tài sản: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    deleteAsset: async (id) => {
      set({ syncing: true });
      try { await sbDeleteAsset(id); }
      catch (e) { window.alert('❌ Lỗi xoá tài sản: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    assetAction: async (args) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      set({ syncing: true });
      try { await sbAssetAction({ ...args, by: u.name }); }
      catch (e) { window.alert('❌ ' + (e as Error).message); throw e; }
      finally { set({ syncing: false }); }
    },
  })),
);

/** Nhãn + màu trạng thái tài sản (dùng chung UI). */
export const ASSET_STATUS: Record<AssetStatus, { label: string; color: string }> = {
  available:   { label: 'Sẵn sàng', color: '#0d7a6a' },
  in_use:      { label: 'Đang dùng', color: '#2563eb' },
  maintenance: { label: 'Bảo trì', color: '#f5a623' },
  retired:     { label: 'Thanh lý', color: '#6b7280' },
  lost:        { label: 'Mất/Hỏng', color: '#dc3250' },
};
