// Helper thuần cho hiển thị chat: nhãn ngày, gộp bong bóng, và @mention.
import type { ChatMessage } from '@/types';

const ymd = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Hai mốc ISO có cùng NGÀY (theo giờ địa phương)? */
export function sameDay(aIso: string, bIso: string): boolean {
  return ymd(aIso) === ymd(bIso);
}

/** Nhãn ngăn cách ngày: "Hôm nay" / "Hôm qua" / "dd/MM/yyyy". */
export function chatDayLabel(iso: string, nowIso?: string): string {
  const now = nowIso ? new Date(nowIso) : new Date();
  const d = new Date(iso);
  if (ymd(iso) === ymd(now.toISOString())) return 'Hôm nay';
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (ymd(iso) === ymd(y.toISOString())) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** Tin `cur` có nên GỘP chung cụm với tin `prev` không (cùng người, cùng ngày, ≤5 phút)? */
export function groupWithPrev(prev: ChatMessage | undefined, cur: ChatMessage): boolean {
  if (!prev) return false;
  if (prev.by !== cur.by) return false;
  if (!sameDay(prev.at, cur.at)) return false;
  return new Date(cur.at).getTime() - new Date(prev.at).getTime() <= GROUP_WINDOW_MS;
}

/**
 * Chuỗi @query đang gõ ngay trước con trỏ (để gợi ý mention). null nếu không có.
 * '@' phải mở đầu một token (đầu chuỗi hoặc sau khoảng trắng) & query không chứa khoảng trắng.
 */
export function mentionQuery(value: string, caret: number): string | null {
  const upto = value.slice(0, caret);
  const at = upto.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(upto[at - 1])) return null;
  const q = upto.slice(at + 1);
  if (/\s/.test(q)) return null;
  return q;
}

/** Thay token '@query' (kết thúc tại con trỏ) bằng '@Tên ' và trả vị trí con trỏ mới. */
export function applyMention(value: string, caret: number, name: string): { value: string; caret: number } {
  const upto = value.slice(0, caret);
  const at = upto.lastIndexOf('@');
  if (at < 0) return { value, caret };
  const before = value.slice(0, at);
  const after = value.slice(caret);
  const insert = `@${name} `;
  return { value: before + insert + after, caret: (before + insert).length };
}

/** Tách text thành các đoạn, đánh dấu đoạn nào là @mention (khớp '@Tên' với danh sách tên). */
export function mentionSegments(text: string, names: string[]): { t: string; mention: boolean }[] {
  const tags = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length).map((n) => `@${n}`);
  if (!tags.length) return text ? [{ t: text, mention: false }] : [];
  const out: { t: string; mention: boolean }[] = [];
  let i = 0;
  let buf = '';
  while (i < text.length) {
    let matched: string | null = null;
    if (text[i] === '@') {
      for (const tag of tags) { if (text.startsWith(tag, i)) { matched = tag; break; } }
    }
    if (matched) {
      if (buf) { out.push({ t: buf, mention: false }); buf = ''; }
      out.push({ t: matched, mention: true });
      i += matched.length;
    } else {
      buf += text[i];
      i += 1;
    }
  }
  if (buf) out.push({ t: buf, mention: false });
  return out;
}
