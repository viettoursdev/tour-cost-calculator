import { create } from 'zustand';

/**
 * Số việc ƯU TIÊN (quá hạn + khẩn) để hiện badge trên tab "Hôm nay" của thanh
 * điều hướng. HomeView ghi mỗi lần render; QuoteToolbar đọc để gắn Badge. Cập nhật
 * khi ghé trang Hôm nay (đủ dùng cho 1 chỉ báo nhắc việc).
 */
interface HomeBadgeState {
  count: number;
  setCount: (n: number) => void;
}

export const useHomeBadgeStore = create<HomeBadgeState>((set) => ({
  count: 0,
  setCount: (n) => set((s) => (s.count === n ? s : { count: n })),
}));
