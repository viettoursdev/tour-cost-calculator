import type { ItineraryType } from '@/types';

// Source: public/legacy.html:1670.
export const ITIN_TYPE: Record<ItineraryType, string> = {
  NN: 'Nước ngoài',
  ND: 'Nội địa',
};

// Source: public/legacy.html:1671.
export const ITIN_CONTINENT: Record<string, string> = {
  CA: 'Châu Á',
  AU: 'Châu Âu',
  MY: 'Châu Mỹ',
  PH: 'Châu Phi',
  DD: 'Châu Đại Dương',
  VN: 'Việt Nam',
};

// Source: public/legacy.html:1672-1679.
export const ITIN_COUNTRY: Record<string, Record<string, string>> = {
  CA: {
    TQ: 'Trung Quốc', NB: 'Nhật Bản', HQ: 'Hàn Quốc', TL: 'Thái Lan',
    SG: 'Singapore', ML: 'Malaysia', ID: 'Indonesia', CPC: 'Campuchia',
    LA: 'Lào', AD: 'Ấn Độ', DB: 'Dubai/UAE', DL: 'Đài Loan', HK: 'Hồng Kông',
  },
  AU: {
    PH: 'Pháp', AN: 'Anh', DC: 'Đức', YL: 'Ý',
    TBN: 'Tây Ban Nha', TS: 'Thụy Sĩ', HL: 'Hà Lan', NGA: 'Nga',
  },
  MY: { MY: 'Mỹ', CND: 'Canada', BRA: 'Brazil' },
  PH: { AC: 'Ai Cập', NP: 'Nam Phi', MRC: 'Morocco' },
  DD: { UC: 'Úc', NZ: 'New Zealand' },
  VN: { MB: 'Miền Bắc', MT: 'Miền Trung', MN: 'Miền Nam' },
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Phần ngày DD.MM.YY của mã (mặc định hôm nay). */
function dateTag(date: Date): string {
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${String(date.getFullYear()).slice(-2)}`;
}

/**
 * Mã chương trình tour — cùng nguyên tắc với mã báo giá:
 *   NN(Loại) . MY(Châu lục) . STT(2 chữ số trong ngày) . DD.MM.YY (ngày tạo)
 * VD: NN.MY.01.20.06.26
 */
export function generateItinCode(
  type: ItineraryType | string,
  continent: string,
  seq: number,
  date: Date = new Date(),
): string {
  const t = type || 'NN';
  const c = continent || 'CA';
  return `${t}.${c}.${pad2(seq || 1)}.${dateTag(date)}`;
}

/** Nhãn số ngày hiển thị, theo cấu hình bắt đầu từ 0 hay 1 (mặc định 1). */
export function dayLabel(dayNum: number, dayStart: number | undefined): number {
  return dayNum - 1 + (dayStart ?? 1);
}

const VN_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** 'dd/MM/yyyy' → 'yyyy-MM-dd' (cho input type=date). Rỗng nếu không hợp lệ. */
export function vnDateToISO(s: string | undefined): string {
  const m = VN_DATE_RE.exec((s ?? '').trim());
  if (!m) return '';
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** 'yyyy-MM-dd' → 'dd/MM/yyyy'. */
export function isoToVNDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

const WEEKDAYS_VN = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/** Thứ trong tuần (tiếng Việt) từ chuỗi 'dd/MM/yyyy'. Rỗng nếu không parse được. */
export function weekdayVN(vnDate: string | undefined): string {
  const iso = vnDateToISO(vnDate);
  if (!iso) return '';
  const dt = new Date(iso + 'T00:00:00');
  return Number.isNaN(dt.getTime()) ? '' : WEEKDAYS_VN[dt.getDay()];
}

/** STT kế tiếp trong ngày cho cặp (type, continent): đếm mã đã tạo hôm nay + 1. */
export function nextItinSeqToday(
  codes: (string | undefined)[],
  type: string,
  continent: string,
  date: Date = new Date(),
): number {
  const prefix = `${type || 'NN'}.${continent || 'CA'}.`;
  const suffix = `.${dateTag(date)}`;
  const todayCount = codes.filter((c) => c && c.startsWith(prefix) && c.endsWith(suffix)).length;
  return todayCount + 1;
}
