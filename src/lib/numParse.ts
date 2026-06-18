/**
 * Phân tích số tiền nhập kiểu tắt / dán từ Excel:
 *  - "1.500.000" / "1,500,000" / "1 500 000" → 1500000 (bỏ dấu phân tách nghìn)
 *  - "1500k" / "1500 ng" / "1500 nghìn"      → 1500000
 *  - "1tr5" / "1.5tr" / "1tr"  / "2m"         → 1500000 / 1500000 / 1000000 / 2000000
 *  - "1tỷ2" / "1ty"                            → 1200000000 / 1000000000
 *  - "12.5" (không hậu tố, có 1 dấu chấm thập phân) → 12.5
 */
export function parseAmountVN(raw: string | number): number {
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return 0;

  const m = s.match(/^([\d.,]+)(tỷ|ty|b|tr|triệu|m|k|ng|nghìn)(\d*)$/);
  if (m) {
    const base = parseFloat(m[1].replace(',', '.')) || 0;
    const mult = /tỷ|ty|b/.test(m[2]) ? 1e9 : /tr|triệu|m/.test(m[2]) ? 1e6 : 1e3;
    // "1tr2" = 1.2tr: phần đuôi là thập phân của base.
    const frac = m[3] ? parseInt(m[3], 10) / Math.pow(10, m[3].length) : 0;
    return Math.round((base + frac) * mult);
  }

  // Không hậu tố: nếu chỉ có 1 dấu '.' hoặc ',' với ≤2 số sau → coi là thập phân;
  // ngược lại bỏ hết dấu phân tách nghìn.
  const dec = s.match(/^(\d+)[.,](\d{1,2})$/);
  if (dec) return parseFloat(`${dec[1]}.${dec[2]}`);
  const n = parseFloat(s.replace(/[.,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
