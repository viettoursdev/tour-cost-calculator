/**
 * Nhắc TỒN THẤP cho Quản lý kho qua hệ notifications.
 * Chỉ nhắc người có quyền manageInventory. Dedup theo (sản phẩm + ngày) qua
 * localStorage → mỗi sản phẩm tối đa một nhắc/ngày dù check chạy lại mỗi 5 phút.
 */
import { sbSendNotification } from '@/lib/supabase';
import { hasPerm } from '@/auth/PERMISSIONS';
import { useInventoryStore, computeStock, itemOnHand } from '@/stores/inventoryStore';
import type { User } from '@/types';

const LOW_STOCK_KEY = 'vte_inv_lowstock_seen';

export async function checkLowStock(user: User): Promise<void> {
  if (!hasPerm(user, 'manageInventory')) return;
  try {
    const { items, lots } = useInventoryStore.getState();
    if (items.length === 0) return;
    const stock = computeStock(lots);
    const today = new Date().toISOString().slice(0, 10);

    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(LOW_STOCK_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const set = new Set(seen);

    const low = items.filter((it) => it.minStock > 0 && itemOnHand(it.id, stock) < it.minStock);
    let sent = 0;
    for (const it of low) {
      const k = `${it.id}:${today}`;
      if (set.has(k)) continue;
      set.add(k);
      const onHand = itemOnHand(it.id, stock);
      await sbSendNotification(user.u, {
        type: 'task',
        title: '📦 Tồn kho thấp',
        message: `${it.name} (${it.code}) — còn ${onHand} ${it.unit}, dưới mức tối thiểu ${it.minStock}. Cân nhắc nhập thêm.`,
        createdBy: 'Hệ thống',
      });
      sent++;
    }
    if (sent) {
      try { localStorage.setItem(LOW_STOCK_KEY, JSON.stringify([...set].slice(-500))); } catch { /* quota */ }
    }
  } catch (e) {
    console.warn('checkLowStock failed:', (e as Error).message);
  }
}
