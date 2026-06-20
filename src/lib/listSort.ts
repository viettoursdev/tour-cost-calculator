/** Shared sort modes for the Customer / NCC card lists. */
export type SortMode = 'oldest' | 'newest' | 'az' | 'za';

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'oldest', label: 'Nhập trước → sau' },
  { value: 'newest', label: 'Mới nhập nhất' },
  { value: 'az', label: 'Tên A → Z' },
  { value: 'za', label: 'Tên Z → A' },
];

/** Sort by entry order (createdAt) or name. Returns a new array. */
export function sortList<T extends { name: string; createdAt: string }>(
  arr: T[],
  mode: SortMode,
): T[] {
  const out = [...arr];
  if (mode === 'az') out.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  else if (mode === 'za') out.sort((a, b) => b.name.localeCompare(a.name, 'vi'));
  else if (mode === 'newest') out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  else out.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return out;
}
