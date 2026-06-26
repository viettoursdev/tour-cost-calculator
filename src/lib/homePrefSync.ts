import { sb } from '@/lib/supabase';
import type { HomeLayout } from '@/components/quote/homeLayout';

/**
 * Đồng bộ bố cục trang "Hôm nay" qua Supabase (`user_prefs`, key `home`) để theo
 * người dùng qua mọi máy/trình duyệt. Tách riêng khỏi `supabase.ts` (file đang
 * được sửa song song) — chỉ dùng client `sb` đã export.
 *
 * Mọi lỗi (offline / RLS) được nuốt: tính năng vẫn chạy bằng cache localStorage.
 */

/** Đọc layout `home` đã đồng bộ của user (null nếu chưa có / lỗi). */
export async function fetchHomeLayout(username: string): Promise<Partial<HomeLayout> | null> {
  const { data, error } = await sb
    .from('user_prefs')
    .select('prefs')
    .eq('username', username)
    .maybeSingle();
  if (error || !data) return null;
  const home = (data.prefs as { home?: Partial<HomeLayout> } | null)?.home;
  return home ?? null;
}

/** Ghi layout `home` lên cloud, GIỮ nguyên các khoá prefs khác (merge). null = xoá. */
export async function pushHomeLayout(username: string, layout: HomeLayout | null): Promise<void> {
  const { data } = await sb.from('user_prefs').select('prefs').eq('username', username).maybeSingle();
  const prefs = { ...((data?.prefs as Record<string, unknown>) ?? {}), home: layout };
  await sb
    .from('user_prefs')
    .upsert({ username, prefs, updated_at: new Date().toISOString() }, { onConflict: 'username' });
}
