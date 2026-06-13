import { create } from 'zustand';

/** Deep-link mở sâu một entry trong các "alt app" (Menu/Itinerary/Visa) vốn chỉ
 *  render khi quote draft.template đổi. Hub liên kết đặt `pending` rồi chuyển
 *  template; app đọc & `consume()` lúc mount để mở đúng entry. */
export type LinkNavKind = 'menu' | 'itinerary' | 'visaProject' | 'visaProc';

type State = {
  pending: { kind: LinkNavKind; id: string } | null;
  request: (kind: LinkNavKind, id: string) => void;
  /** Lấy & xoá pending nếu khớp kind (trả id để mở), ngược lại null. */
  consume: (kind: LinkNavKind) => string | null;
};

export const useLinkNavStore = create<State>()((set, get) => ({
  pending: null,
  request: (kind, id) => set({ pending: { kind, id } }),
  consume: (kind) => {
    const p = get().pending;
    if (!p || p.kind !== kind) return null;
    set({ pending: null });
    return p.id;
  },
}));
