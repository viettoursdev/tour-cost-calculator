/**
 * Hiệu lực báo giá (customer-facing). `validUntil` là ISO date 'YYYY-MM-DD'
 * (HẾT hiệu lực vào CUỐI ngày đó). Báo giá không đặt hạn → mặc định
 * `DEFAULT_VALID_DAYS` ngày kể từ ngày mốc (ngày báo giá / ngày xuất bản).
 *
 * Logic THUẦN (chỉ thao tác ngày/chuỗi) để test & dùng chung cho bản in
 * (QuotePrintable), bản chia sẻ khách (PublicQuote) và ô nhập (QuoteTermsEditor).
 */

export const DEFAULT_VALID_DAYS = 7;

/** 'YYYY-MM-DD' của một Date (theo giờ địa phương). */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Cộng `days` ngày vào 1 ISO date/datetime → ISO date 'YYYY-MM-DD'. */
export function addDaysISO(fromISO: string, days: number): string {
  const d = new Date(fromISO);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** ISO date hiệu lực hiệu dụng: hạn đặt tay, hoặc mốc + DEFAULT_VALID_DAYS. */
export function effectiveValidUntil(explicit: string | undefined, baseISO: string): string {
  return explicit || addDaysISO(baseISO, DEFAULT_VALID_DAYS);
}

export type ValidityStatus = {
  validUntil: string; // ISO date hiệu lực đến hết ngày
  expired: boolean;
  daysLeft: number;   // số ngày còn lại (0 = hết hạn hôm nay, âm = đã quá hạn)
};

/**
 * Tình trạng hiệu lực tại thời điểm `now` (mặc định hôm nay). So sánh theo NGÀY
 * (hết hiệu lực vào cuối ngày `validUntil`), không theo giờ.
 */
export function validityStatus(validUntil: string, now: Date = new Date()): ValidityStatus {
  const startOfDay = (iso: string) => Date.parse(`${iso}T00:00:00`);
  const daysLeft = Math.round((startOfDay(validUntil) - startOfDay(isoDate(now))) / 86400000);
  return { validUntil, expired: daysLeft < 0, daysLeft };
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' để hiển thị. Trống/không hợp lệ → ''. */
export function fmtDateVN(iso?: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}
