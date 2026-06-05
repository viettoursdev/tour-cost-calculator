/**
 * Convert a VND integer to Vietnamese words.
 * Source: public/legacy.html:3639-3662.
 */
export function numberToVietWords(num: number): string {
  if (num === 0) return 'không';
  const units = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const scales = ['', 'nghìn', 'triệu', 'tỷ'];
  num = Math.round(num);
  const groups: number[] = [];
  while (num > 0) { groups.push(num % 1000); num = Math.floor(num / 1000); }
  const readGroup = (n: number, full: boolean): string => {
    const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), u = n % 10;
    let s = '';
    if (full || h > 0) s += units[h] + ' trăm ';
    if (t > 1) { s += units[t] + ' mươi '; if (u === 1) s += 'mốt '; else if (u === 5) s += 'lăm '; else if (u > 0) s += units[u] + ' '; }
    else if (t === 1) { s += 'mười '; if (u === 5) s += 'lăm '; else if (u > 0) s += units[u] + ' '; }
    else if (t === 0 && u > 0) { if (full || h > 0) s += 'lẻ '; s += units[u] + ' '; }
    return s;
  };
  let result = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] > 0 || i < groups.length - 1) {
      result += readGroup(groups[i], i < groups.length - 1 && result !== '') + scales[i] + ' ';
    }
  }
  result = result.trim();
  return result.charAt(0).toUpperCase() + result.slice(1);
}
