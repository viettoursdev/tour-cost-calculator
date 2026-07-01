// Tìm kiếm tin nhắn TOÀN CỤC (mọi cuộc trò chuyện của user).
// Đặt riêng khỏi supabase.ts để tránh va chạm khi file đó đang được sửa song song.
import type { SupabaseClient } from '@supabase/supabase-js';
import { sb } from './supabase';

/** Một kết quả tìm kiếm tin nhắn (đủ để hiển thị + mở đúng cuộc). */
export type ChatSearchHit = {
  chatId: string;
  msgId: string;    // legacy_id (id phía app)
  byName: string;
  at: string;       // ISO
  text: string;
};

const SEARCH_LIMIT = 40;
// Thoát ký tự đại diện của ILIKE để người dùng tìm '%'/'_' theo nghĩa đen.
const escapeLike = (q: string) => q.replace(/[\\%_]/g, '\\$&');

/**
 * Tìm các tin nhắn có nội dung chứa `query` (không phân biệt hoa/thường) trên MỌI cuộc.
 * RLS 0086 (chat_is_member) tự giới hạn về các cuộc user là thành viên nên không lộ
 * tin của người khác. Bỏ tin đã thu hồi & tin hệ thống. Mới nhất trước.
 */
export async function sbSearchChatMessages(
  query: string,
  client: SupabaseClient = sb,
): Promise<ChatSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await client
    .from('chat_messages')
    .select('chat_id, legacy_id, by_name, at, text')
    .ilike('text', `%${escapeLike(q)}%`)
    .eq('deleted', false)
    .eq('is_system', false)
    .order('at', { ascending: false })
    .limit(SEARCH_LIMIT);
  if (error) throw new Error('sbSearchChatMessages: ' + error.message);
  return (data ?? []).map((r) => ({
    chatId: r.chat_id as string,
    msgId: (r.legacy_id as string) ?? '',
    byName: (r.by_name as string) ?? '',
    at: r.at ? new Date(r.at as string).toISOString() : '',
    text: (r.text as string) ?? '',
  }));
}
