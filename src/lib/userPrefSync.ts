import { sb } from '@/lib/supabase';

/**
 * Đồng bộ TÙY CHỌN CÁ NHÂN qua Supabase `user_prefs` (1 hàng/user, cột `prefs` JSONB)
 * — mỗi tính năng một khoá namespace: `ui` (giao diện), `nav` (thanh điều hướng),
 * `visaExportCols` (cột Excel visa)… `home`/`targets` dùng gateway riêng có trước
 * (`homePrefSync`/`homeTargetsSync`) — cùng bảng, cùng semantics merge.
 *
 * Mọi lỗi để caller nuốt: các tính năng vẫn chạy bằng cache localStorage khi offline.
 */

/** Đọc một khoá trong `prefs` (null nếu chưa có). */
export async function fetchUserPref(username: string, key: string): Promise<unknown> {
  const { data, error } = await sb
    .from('user_prefs')
    .select('prefs')
    .eq('username', username)
    .maybeSingle();
  if (error || !data) return null;
  return (data.prefs as Record<string, unknown> | null)?.[key] ?? null;
}

/** Ghi một khoá lên cloud, GIỮ nguyên các khoá prefs khác (merge). null = xoá. */
export async function pushUserPref(username: string, key: string, blob: unknown): Promise<void> {
  const { data } = await sb
    .from('user_prefs')
    .select('prefs')
    .eq('username', username)
    .maybeSingle();
  const prefs = { ...((data?.prefs as Record<string, unknown>) ?? {}), [key]: blob };
  await sb
    .from('user_prefs')
    .upsert({ username, prefs, updated_at: new Date().toISOString() }, { onConflict: 'username' });
}
