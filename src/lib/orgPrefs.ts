import { sb } from '@/lib/supabase';
import type { Department } from '@/types';

/**
 * Tùy chọn CẤP TỔ CHỨC trong `app_config` (key-value, đọc bằng policy công ty sẵn có).
 * GHI qua RPC `set_org_pref` (migration 0096) — gate theo vai trò server-side:
 *  - `nav_preset_{dept}`: Trưởng/Phó Phòng của phòng đó hoặc BGĐ+.
 *  - `module_flags`     : chỉ CEO / Ban Giám Đốc / Trợ lý Giám Đốc.
 * Khác `userPrefSync` (tùy chọn CÁ NHÂN theo user) — đây là mặc định CHUNG.
 */

export const navPresetKey = (dept: Department) => `nav_preset_${dept}`;
export const MODULE_FLAGS_KEY = 'module_flags';

/** Đọc một khoá org (null nếu chưa đặt / offline). */
export async function fetchOrgPref(key: string): Promise<string | null> {
  const { data, error } = await sb
    .from('app_config')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error || !data) return null;
  return data.value ?? null;
}

/** Ghi một khoá org (null/'' = xoá về mặc định hệ thống). Ném lỗi nếu bị gate chặn. */
export async function setOrgPref(key: string, value: string | null): Promise<void> {
  const { error } = await sb.rpc('set_org_pref', { pref_key: key, pref_value: value ?? '' });
  if (error) throw new Error(error.message);
}
