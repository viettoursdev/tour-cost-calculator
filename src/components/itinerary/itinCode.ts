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

// Source: public/legacy.html:1680-1683.
export function generateItinCode(
  type: ItineraryType | string,
  continent: string,
  country: string,
  seq: number,
): string {
  const t = type || 'NN';
  const c = continent || 'CA';
  const ct = country || 'TQ';
  return `${t}-${c}-${ct}-${String(seq || 1).padStart(3, '0')}`;
}
