import { sb } from '@/lib/supabase';

/** Chỉ tiêu tháng của user, đồng bộ Supabase (`user_prefs.targets`). */
export interface MonthlyTargets {
  /** Số báo giá cần chốt trong tháng. */
  quotes: number;
  /** Doanh thu mục tiêu trong tháng (VND). */
  revenue: number;
}

export const EMPTY_TARGETS: MonthlyTargets = { quotes: 0, revenue: 0 };

export async function fetchTargets(username: string): Promise<MonthlyTargets | null> {
  const { data, error } = await sb.from('user_prefs').select('prefs').eq('username', username).maybeSingle();
  if (error || !data) return null;
  const t = (data.prefs as { targets?: MonthlyTargets } | null)?.targets;
  return t ?? null;
}

/** Ghi chỉ tiêu lên cloud, GIỮ nguyên các khoá prefs khác (home…). */
export async function pushTargets(username: string, t: MonthlyTargets): Promise<void> {
  const { data } = await sb.from('user_prefs').select('prefs').eq('username', username).maybeSingle();
  const prefs = { ...((data?.prefs as Record<string, unknown>) ?? {}), targets: t };
  await sb.from('user_prefs').upsert({ username, prefs, updated_at: new Date().toISOString() }, { onConflict: 'username' });
}
