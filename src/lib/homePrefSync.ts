import { sb } from '@/lib/supabase';
import type { PresetState } from '@/components/quote/homePresets';

/**
 * Đồng bộ bố cục trang "Hôm nay" qua Supabase (`user_prefs`, key `home`) để theo
 * người dùng qua mọi máy/trình duyệt. Lưu cả nhiều "bố cục đặt tên" (PresetState).
 * Tách riêng khỏi `supabase.ts` — chỉ dùng client `sb` đã export.
 *
 * Mọi lỗi (offline / RLS) được nuốt: tính năng vẫn chạy bằng cache localStorage.
 */

/** Đọc blob `home` đã đồng bộ (PresetState v2 HOẶC HomeLayout cũ; null nếu chưa có). */
export async function fetchHomePref(username: string): Promise<unknown> {
  const { data, error } = await sb
    .from('user_prefs')
    .select('prefs')
    .eq('username', username)
    .maybeSingle();
  if (error || !data) return null;
  return (data.prefs as { home?: unknown } | null)?.home ?? null;
}

/** Ghi blob `home` lên cloud, GIỮ nguyên các khoá prefs khác (merge). null = xoá. */
export async function pushHomePref(username: string, blob: PresetState | null): Promise<void> {
  const { data } = await sb.from('user_prefs').select('prefs').eq('username', username).maybeSingle();
  const prefs = { ...((data?.prefs as Record<string, unknown>) ?? {}), home: blob };
  await sb
    .from('user_prefs')
    .upsert({ username, prefs, updated_at: new Date().toISOString() }, { onConflict: 'username' });
}
