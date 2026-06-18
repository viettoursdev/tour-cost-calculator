/**
 * Điều hướng bàn phím kiểu spreadsheet cho bảng chi phí (LineRow).
 *
 * Mỗi ô nhập liệu gắn `data-nav="<cột>"`; các ô hiển thị (span) cùng cột ở
 * các dòng khác cũng gắn `data-nav` tương ứng. Khi rời 1 ô bằng Enter/Tab ta
 * tìm ô đích trong DOM rồi `.click()` để mở chế độ sửa (ô đích đang là span).
 *
 * - Enter  → xuống cùng cột (dòng dưới)
 * - Tab    → ô kế tiếp; hết hàng → đầu cột dòng dưới
 * - ⇧Tab   → ô trước; đầu hàng → cuối cột dòng trên
 */
export const NAV_COLS = ['name', 'note', 'price', 'times'] as const;
export type NavCol = (typeof NAV_COLS)[number];
export type NavDir = 'down' | 'up' | 'next' | 'prev';

export function navFrom(el: HTMLElement, dir: NavDir): void {
  const tr = el.closest('tr');
  const tbody = tr?.closest('tbody');
  if (!tr || !tbody) return;
  const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>(':scope > tr'));
  let r = rows.indexOf(tr);
  let c = NAV_COLS.indexOf((el.getAttribute('data-nav') ?? '') as NavCol);
  if (r < 0 || c < 0) return;

  if (dir === 'down') r += 1;
  else if (dir === 'up') r -= 1;
  else if (dir === 'next') { c += 1; if (c >= NAV_COLS.length) { c = 0; r += 1; } }
  else { c -= 1; if (c < 0) { c = NAV_COLS.length - 1; r -= 1; } }

  const target = rows[r]?.querySelector<HTMLElement>(`[data-nav="${NAV_COLS[c]}"]`);
  // Ô đích đang là span hiển thị → click để mở input (tự autofocus). Hoãn 1
  // frame để dòng/ô hiện tại kịp re-render sau khi commit.
  if (target) requestAnimationFrame(() => target.click());
}
