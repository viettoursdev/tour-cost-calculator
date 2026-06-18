/**
 * Đọc số tiền thành chữ tiếng Việt (kiểu kế toán) để soát nhầm số khi nhập.
 *  - docSoVN(1500000)  → "một triệu năm trăm nghìn"
 *  - docTienVN(1500000) → "Một triệu năm trăm nghìn đồng"
 * Hỗ trợ tới ~ hàng nghìn tỷ (đủ cho báo giá tour); ngoài ngưỡng trả số thô.
 */
const ONES = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

/** Đọc 1 nhóm 0–999. `leadingZero`=true → luôn đọc "… trăm" kể cả khi trăm = 0. */
function read3(num: number, leadingZero: boolean): string {
  const tram = Math.floor(num / 100);
  const chuc = Math.floor((num / 10) % 10);
  const dv = num % 10;
  const parts: string[] = [];
  if (tram > 0 || leadingZero) parts.push(ONES[tram], 'trăm');
  if (chuc > 1) {
    parts.push(ONES[chuc], 'mươi');
    if (dv === 1) parts.push('mốt');
    else if (dv === 5) parts.push('lăm');
    else if (dv > 0) parts.push(ONES[dv]);
  } else if (chuc === 1) {
    parts.push('mười');
    if (dv === 5) parts.push('lăm');
    else if (dv > 0) parts.push(ONES[dv]);
  } else if (dv > 0) {
    if (tram > 0 || leadingZero) parts.push('lẻ');
    parts.push(ONES[dv]);
  }
  return parts.join(' ');
}

export function docSoVN(input: number): string {
  if (!Number.isFinite(input)) return '';
  let n = Math.round(input);
  if (n === 0) return 'không';
  const neg = n < 0;
  n = Math.abs(n);

  const groups: number[] = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  if (groups.length > SCALES.length) return input.toLocaleString('vi-VN'); // quá lớn → số thô

  const out: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue; // bỏ qua nhóm rỗng (nhóm con khác vẫn tự đọc "không trăm")
    const txt = read3(g, i !== groups.length - 1);
    if (txt) out.push(SCALES[i] ? `${txt} ${SCALES[i]}` : txt);
  }
  return (neg ? 'âm ' : '') + out.join(' ').replace(/\s+/g, ' ').trim();
}

export function docTienVN(input: number): string {
  const s = docSoVN(input);
  if (!s) return '';
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} đồng`;
}
