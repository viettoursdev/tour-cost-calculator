import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useNccProductsStore, priceToVND } from './nccProductsStore';
import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as sb from '@/lib/supabase';
import type { NccProduct, User } from '@/types';

const resetProd = snapshotInitial(useNccProductsStore);
const resetAuth = snapshotInitial(useAuthStore);
const u: User = { u: 'op1', p: 'x', role: 'Operations', name: 'Khang', color: '#000' };

beforeEach(() => {
  resetProd();
  resetAuth();
  vi.clearAllMocks();
  useAuthStore.setState({ currentUser: u }, false);
});

const prod = (over: Partial<NccProduct> = {}): NccProduct =>
  ({ id: 'np1', nccId: null, nccName: 'KS A', category: 'hotel', name: 'Phòng đôi', prices: [], files: [], createdAt: '', createdBy: '', ...over });

describe('nccProductsStore', () => {
  it('init subscribes and populates', () => {
    useNccProductsStore.getState().init();
    const cb = vi.mocked(sb.sbSubscribeNccProducts).mock.calls[0][0];
    cb([prod()]);
    expect(useNccProductsStore.getState().products).toHaveLength(1);
  });

  it('save prepends a new product with id + creator and pushes', async () => {
    await useNccProductsStore.getState().save(prod({ id: '', name: 'Xe 16 chỗ' }));
    const list = useNccProductsStore.getState().products;
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Xe 16 chỗ');
    expect(list[0].createdBy).toBe('Khang');
    expect(list[0].id.length).toBeGreaterThan(0);
    // Lưu an toàn: chỉ upsert ĐÚNG sản phẩm vừa thêm, KHÔNG đẩy cả danh sách (tránh wipe).
    expect(sb.sbUpsertNccProduct).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sb.sbUpsertNccProduct).mock.calls[0][0]).toMatchObject({ name: 'Xe 16 chỗ' });
    expect(sb.sbPushNccProducts).not.toHaveBeenCalled();
  });

  it('save updates an existing product in place', async () => {
    useNccProductsStore.setState({ products: [prod()] }, false);
    await useNccProductsStore.getState().save(prod({ name: 'Phòng đôi (sửa)' }));
    const list = useNccProductsStore.getState().products;
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Phòng đôi (sửa)');
    expect(list[0].updatedBy).toBe('Khang');
  });

  it('save rolls back optimistic state when sync fails', async () => {
    vi.mocked(sb.sbUpsertNccProduct).mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    useNccProductsStore.setState({ products: [prod()] }, false);
    await expect(useNccProductsStore.getState().save(prod({ id: '', name: 'Mới' }))).rejects.toThrow('boom');
    // Rollback: danh sách trở lại như cũ, không giữ lại bản "lưu" giả.
    const list = useNccProductsStore.getState().products;
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Phòng đôi');
  });

  it('remove deletes only that product (no full-list push)', async () => {
    useNccProductsStore.setState({ products: [prod(), prod({ id: 'np2', name: 'B' })] }, false);
    await useNccProductsStore.getState().remove('np1');
    const list = useNccProductsStore.getState().products;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('np2');
    expect(sb.sbDeleteNccProduct).toHaveBeenCalledWith('np1');
    expect(sb.sbPushNccProducts).not.toHaveBeenCalled();
  });
});

describe('priceToVND', () => {
  const rates = { VND: 1, USD: 25000, JPY: 165 };
  it('keeps VND as-is', () => expect(priceToVND(500000, 'VND', rates)).toBe(500000));
  it('converts foreign currency by rate', () => expect(priceToVND(100, 'USD', rates)).toBe(2500000));
  it('falls back to rate 1 for unknown currency', () => expect(priceToVND(100, 'XYZ', rates)).toBe(100));
});
