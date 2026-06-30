/**
 * Lõi tìm kiếm dùng chung (toàn cục + từng list).
 * - Bỏ dấu tiếng Việt: gõ "da nang" khớp "Đà Nẵng".
 * - Đa token (AND): "khach amway" khớp khi cả hai từ xuất hiện.
 * - Fuzzy nhẹ: token không khớp substring vẫn thử subsequence (điểm thấp hơn).
 * - Xếp hạng: thưởng khớp đầu chuỗi / đầu từ.
 */

/** Bỏ dấu tiếng Việt + lowercase. */
export function normalizeVN(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // dấu tổ hợp (combining marks)
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** Khớp subsequence (mọi ký tự query xuất hiện đúng thứ tự) — fuzzy nhẹ. */
function isSubsequence(token: string, hay: string): boolean {
  let i = 0;
  for (let j = 0; j < hay.length && i < token.length; j++) {
    if (hay[j] === token[i]) i++;
  }
  return i === token.length;
}

/** Tuỳ chọn tìm kiếm. */
export type SearchOpts = {
  /**
   * Bật fuzzy subsequence (mặc định true). Đặt `false` để CHỈ khớp CHÍNH XÁC
   * theo ký tự (substring liền mạch) — dùng cho tìm theo tên Khách hàng/NCC,
   * không bắt buộc nhập full tên nhưng các ký tự gõ phải liền nhau.
   */
  fuzzy?: boolean;
};

/** Điểm khớp 1 token với chuỗi đã normalize (0 = không khớp). */
function tokenScore(token: string, hay: string, fuzzy: boolean): number {
  if (!token) return 0;
  const idx = hay.indexOf(token);
  if (idx >= 0) {
    if (idx === 0) return 100;                                   // khớp đầu chuỗi
    if (hay[idx - 1] === ' ') return 80;                          // khớp đầu một từ
    return 60;                                                    // khớp giữa
  }
  if (fuzzy && token.length >= 3 && isSubsequence(token, hay)) return 20;  // fuzzy nhẹ
  return 0;
}

/**
 * Điểm khớp toàn bộ query với haystack (chuỗi gốc — sẽ tự normalize).
 * Trả về > 0 khi MỌI token khớp; càng cao càng liên quan.
 */
export function searchScore(haystack: string, query: string, opts: SearchOpts = {}): number {
  const fuzzy = opts.fuzzy ?? true;
  const q = normalizeVN(query);
  if (!q) return 1; // query rỗng: mọi mục "khớp" (điểm tối thiểu)
  const hay = normalizeVN(haystack);
  if (!hay) return 0;
  const tokens = q.split(/\s+/).filter(Boolean);
  let total = 0;
  for (const t of tokens) {
    const s = tokenScore(t, hay, fuzzy);
    if (s === 0) return 0;  // AND: thiếu 1 token là loại
    total += s;
  }
  // Thưởng nhẹ khi haystack ngắn (khớp "đậm đặc" hơn).
  return total + Math.max(0, 20 - hay.length / 8);
}

/** Có khớp hay không (tiện cho lọc đơn giản). */
export function matchesQuery(haystack: string, query: string, opts: SearchOpts = {}): boolean {
  return searchScore(haystack, query, opts) > 0;
}

/**
 * Lọc + xếp hạng một danh sách theo query. `getText` trả về chuỗi gộp các trường
 * cần tìm của mỗi item. Giữ nguyên thứ tự gốc khi query rỗng.
 */
export function filterRank<T>(list: T[], query: string, getText: (item: T) => string, opts: SearchOpts = {}): T[] {
  if (!query.trim()) return list;
  return list
    .map((item) => ({ item, score: searchScore(getText(item), query, opts) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}
