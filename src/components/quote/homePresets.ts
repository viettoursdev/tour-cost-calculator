import { reconcileHomeLayout, type HomeLayout } from './homeLayout';

/**
 * Nhiều "bố cục đặt tên" cho trang Hôm nay (vd Sáng / Vận hành / Sales) — user
 * chuyển nhanh giữa các chế độ. Lưu cùng chỗ với bố cục (localStorage + Supabase
 * `user_prefs.home`), nhưng theo cấu trúc v2: { activeId, presets[] }.
 *
 * Tương thích ngược: blob cũ là 1 HomeLayout (có `.order`) → gói thành 1 preset.
 * Thuần để test & tách khỏi React.
 */

export interface HomePreset {
  id: string;
  name: string;
  layout: HomeLayout;
}
export interface PresetState {
  activeId: string;
  presets: HomePreset[];
}

export const DEFAULT_PRESET_NAME = 'Mặc định';
export const MAX_PRESETS = 8;

const pid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const hasOrder = (o: unknown): o is Partial<HomeLayout> =>
  !!o && typeof o === 'object' && Array.isArray((o as { order?: unknown }).order);

/** Chuẩn hoá blob đã lưu (PresetState v2 | HomeLayout cũ | null) → PresetState hợp lệ. */
export function normalizePresets(catalog: string[], raw: unknown): PresetState {
  const asV2 = raw as { presets?: unknown; activeId?: unknown } | null;
  if (asV2 && Array.isArray(asV2.presets) && asV2.presets.length > 0) {
    const presets: HomePreset[] = asV2.presets.map((p) => {
      const pp = p as Partial<HomePreset>;
      return {
        id: pp.id || pid(),
        name: pp.name || DEFAULT_PRESET_NAME,
        layout: reconcileHomeLayout(catalog, pp.layout),
      };
    });
    const activeId = presets.some((p) => p.id === asV2.activeId) ? (asV2.activeId as string) : presets[0].id;
    return { activeId, presets };
  }
  const layout = reconcileHomeLayout(catalog, hasOrder(raw) ? raw : null);
  const def: HomePreset = { id: 'default', name: DEFAULT_PRESET_NAME, layout };
  return { activeId: def.id, presets: [def] };
}

export function activePreset(state: PresetState): HomePreset {
  return state.presets.find((p) => p.id === state.activeId) ?? state.presets[0];
}
export function activeLayout(state: PresetState): HomeLayout {
  return activePreset(state).layout;
}

/** Ghi đè layout cho preset đang chọn. */
export function setActiveLayout(state: PresetState, layout: HomeLayout): PresetState {
  return { ...state, presets: state.presets.map((p) => (p.id === state.activeId ? { ...p, layout } : p)) };
}

export function switchPreset(state: PresetState, id: string): PresetState {
  return state.presets.some((p) => p.id === id) ? { ...state, activeId: id } : state;
}

/** Thêm preset mới = clone layout đang chọn (hoặc layout truyền vào), thành active. */
export function addPreset(state: PresetState, name: string, layout?: HomeLayout): PresetState {
  if (state.presets.length >= MAX_PRESETS) return state;
  const p: HomePreset = {
    id: pid(),
    name: name.trim() || `Bố cục ${state.presets.length + 1}`,
    layout: layout ?? activeLayout(state),
  };
  return { activeId: p.id, presets: [...state.presets, p] };
}

export function renamePreset(state: PresetState, id: string, name: string): PresetState {
  return { ...state, presets: state.presets.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)) };
}

/** Xoá preset (giữ tối thiểu 1). Xoá cái đang chọn → về cái đầu còn lại. */
export function deletePreset(state: PresetState, id: string): PresetState {
  if (state.presets.length <= 1) return state;
  const presets = state.presets.filter((p) => p.id !== id);
  const activeId = state.activeId === id ? presets[0].id : state.activeId;
  return { activeId, presets };
}
