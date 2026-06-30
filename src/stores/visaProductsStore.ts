import { create } from 'zustand';
import {
  sbSaveVisaProducts,
  sbSubscribeVisaProducts,
  sbUpsertVisaProduct,
  sbDeleteVisaProduct,
  sbSnapshotVisaProducts,
} from '@/lib/supabase';
import { RATES_INIT } from '@/components/quote/constants';
import type { VisaProduct, VisaProductVersion } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type State = {
  products: VisaProduct[];
  rates: Record<string, number>;
  versions: VisaProductVersion[];
  loaded: boolean;
  init: () => Unsubscribe;
  /** Cập nhật danh sách hiển thị NGAY (optimistic, chưa ghi DB) — cho gõ phím mượt. */
  setLocal: (products: VisaProduct[]) => void;
  /** Ghi MỘT sản phẩm (an toàn — không đụng sản phẩm khác). Báo lỗi nếu thất bại. */
  upsertProduct: (p: VisaProduct) => Promise<void>;
  /** Xoá MỘT sản phẩm (optimistic + rollback nếu DB từ chối). */
  removeProduct: (id: string) => Promise<void>;
  /** Ghi 1 mốc khôi phục + tỷ giá (gọi debounced sau mỗi đợt sửa). */
  snapshot: (rates: Record<string, number>, savedBy: string) => Promise<void>;
  /** Full-overwrite — CHỈ dùng cho khôi phục từ lịch sử (hành động chủ động, hiếm). */
  save: (data: { products: VisaProduct[]; rates: Record<string, number> }, savedBy: string) => Promise<void>;
};

export const useVisaProductsStore = create<State>()((set, get) => ({
  products: [],
  rates: { ...RATES_INIT },
  versions: [],
  loaded: false,

  init: () => sbSubscribeVisaProducts((d) => {
    if (d) {
      set((s) => ({
        products: d.products ?? [],
        rates: d.rates && Object.keys(d.rates).length ? { ...s.rates, ...d.rates } : s.rates,
        versions: d.versions ?? [],
        loaded: true,
      }));
    } else {
      set({ loaded: true });
    }
  }),

  setLocal: (products) => set({ products }),

  upsertProduct: async (p) => {
    try {
      await sbUpsertVisaProduct(p);
    } catch (e) {
      // KHÔNG để báo "đã lưu" giả: báo lỗi; subscribe sẽ kéo lại trạng thái thật từ server.
      window.alert('❌ Lỗi đồng bộ sản phẩm visa (CHƯA lưu được): ' + (e as Error).message);
      throw e;
    }
  },

  removeProduct: async (id) => {
    const prev = get().products;
    set({ products: prev.filter((p) => p.id !== id) });
    try {
      await sbDeleteVisaProduct(id);
    } catch (e) {
      set({ products: prev }); // rollback — mục đã xoá không được biến mất nếu DB chưa xoá
      window.alert('❌ Lỗi xoá sản phẩm visa (CHƯA xoá được): ' + (e as Error).message);
    }
  },

  snapshot: async (rates, savedBy) => {
    try {
      await sbSnapshotVisaProducts(get().products, rates, savedBy);
    } catch {
      /* mốc khôi phục là phụ trợ — không chặn UI; dữ liệu chính đã ghi per-row */
    }
  },

  save: async (data, savedBy) => {
    set({ products: data.products, rates: data.rates });
    try {
      await sbSaveVisaProducts(data, savedBy);
    } catch (e) {
      window.alert('Lỗi đồng bộ visa: ' + (e as Error).message);
    }
  },
}));
