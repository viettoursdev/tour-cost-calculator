export function debounce<A extends unknown[]>(
  fn: (...args: A) => unknown,
  wait: number,
): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/**
 * Caption "Lưu bởi {tên} · {thời gian}" cho file đính kèm. Dữ liệu cũ có thể
 * thiếu `uploadedBy`/`uploadedAt` → trả về chuỗi rỗng để không hiển thị gì.
 */
export function attMeta(att: { uploadedBy?: string; uploadedAt?: string }): string {
  const parts: string[] = [];
  if (att.uploadedBy) parts.push(`Lưu bởi ${att.uploadedBy}`);
  if (att.uploadedAt) {
    const d = new Date(att.uploadedAt);
    if (!isNaN(d.getTime())) parts.push(d.toLocaleString('vi-VN'));
  }
  return parts.join(' · ');
}

/** Bỏ cú pháp `**in đậm**` khỏi ghi chú khi xuất ra file (Excel/PDF). */
export function plainNote(s: string | undefined | null): string {
  return (s ?? '').replace(/\*\*(.+?)\*\*/g, '$1');
}

export function applyPath<T>(obj: T, path: string, value: unknown): T {
  // Dot-path setter, returns a new object. Used by rate card updates.
  const keys = path.split('.');
  const clone = structuredClone(obj) as Record<string, unknown>;
  let cur: Record<string, unknown> = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return clone as T;
}
