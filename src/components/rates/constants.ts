// Subset of legacy constants needed by the Rates tab.
// Sources: public/legacy.html lines 1005, 1400, 1423, 1430.
// Seed data (HOTEL_DB, RATE_VISA, RATE_TRANSPORT, …) is intentionally NOT mirrored here —
// those defaults belong to the Cost view (Phase 3). The Rates tab edits whatever the user
// has already saved, falling back to an empty list.

export type HotelCity = { id: string; label: string };
export const HOTEL_CITIES: HotelCity[] = [
  { id: 'hcm', label: 'Hồ Chí Minh' },
  { id: 'han', label: 'Hà Nội' },
  { id: 'dad', label: 'Đà Nẵng' },
  { id: 'nha', label: 'Nha Trang' },
  { id: 'phq', label: 'Phú Quốc' },
  { id: 'hue', label: 'Huế' },
  { id: 'hoian', label: 'Hội An' },
  { id: 'dalat', label: 'Đà Lạt' },
  { id: 'vungtau', label: 'Vũng Tàu' },
  { id: 'mui_ne', label: 'Phan Thiết - Mũi Né' },
  { id: 'sapa', label: 'Sapa' },
  { id: 'halong', label: 'Hạ Long' },
  { id: 'con_dao', label: 'Côn Đảo' },
  { id: 'quy_nhon', label: 'Quy Nhơn' },
];

export type VisaCountry = { id: string; label: string; flag: string };
export const VISA_COUNTRIES: VisaCountry[] = [
  { id: 'jp', label: 'Nhật Bản', flag: '🇯🇵' },
  { id: 'kr', label: 'Hàn Quốc', flag: '🇰🇷' },
  { id: 'cn', label: 'Trung Quốc', flag: '🇨🇳' },
  { id: 'tw', label: 'Đài Loan', flag: '🇹🇼' },
  { id: 'th', label: 'Thái Lan', flag: '🇹🇭' },
  { id: 'sg', label: 'Singapore', flag: '🇸🇬' },
  { id: 'my', label: 'Malaysia', flag: '🇲🇾' },
  { id: 'id', label: 'Indonesia', flag: '🇮🇩' },
  { id: 'ph', label: 'Philippines', flag: '🇵🇭' },
  { id: 'in', label: 'Ấn Độ', flag: '🇮🇳' },
  { id: 'au', label: 'Úc', flag: '🇦🇺' },
  { id: 'nz', label: 'New Zealand', flag: '🇳🇿' },
  { id: 'us', label: 'Mỹ', flag: '🇺🇸' },
  { id: 'ca', label: 'Canada', flag: '🇨🇦' },
  { id: 'uk', label: 'Anh', flag: '🇬🇧' },
  { id: 'schengen', label: 'Schengen (EU)', flag: '🇪🇺' },
  { id: 'ru', label: 'Nga', flag: '🇷🇺' },
  { id: 'ae', label: 'UAE / Dubai', flag: '🇦🇪' },
  { id: 'za', label: 'Nam Phi', flag: '🇿🇦' },
  { id: 'eg', label: 'Ai Cập', flag: '🇪🇬' },
];

export type VisaType = { id: string; label: string; short: string; icon: string };
export const VISA_TYPES: VisaType[] = [
  { id: 'tourist_single', label: 'Du lịch - 1 lần', short: 'DL-1', icon: '🏖️' },
  { id: 'tourist_multi', label: 'Du lịch - Multi', short: 'DL-M', icon: '🌍' },
  { id: 'business_single', label: 'Công tác - 1 lần', short: 'CT-1', icon: '💼' },
  { id: 'business_multi', label: 'Công tác - Multi', short: 'CT-M', icon: '🤝' },
];

export type VisaCostType = { id: string; label: string; labelEn: string; icon: string };
export const VISA_COST_TYPES: VisaCostType[] = [
  { id: 'consular', label: 'Phí lãnh sự', labelEn: 'Consular fee', icon: '🏛️' },
  { id: 'center', label: 'Phí trung tâm tiếp nhận', labelEn: 'Visa center (VFS/TLS)', icon: '🏢' },
  { id: 'translation', label: 'Phí dịch thuật', labelEn: 'Translation', icon: '📝' },
  { id: 'notary', label: 'Phí công chứng', labelEn: 'Notary', icon: '📜' },
  { id: 'legalization', label: 'Hợp thức hoá lãnh sự', labelEn: 'Consular legalization', icon: '🔖' },
  { id: 'vip', label: 'Ngoài giờ / Phòng VIP', labelEn: 'After-hours / VIP', icon: '⭐' },
  { id: 'delivery', label: 'Chuyển phát', labelEn: 'Delivery', icon: '📦' },
  { id: 'logistics', label: 'Logistics', labelEn: 'Logistics', icon: '🚚' },
  { id: 'misc', label: 'Chi phí khác', labelEn: 'Other', icon: '📌' },
];

// Categories shown on the Rates launcher panel (mirrors the legacy "📋 Rate Card" dropdown
// at public/legacy.html:8707).
export type RateCategory = { key: string; label: string; icon: string };
export const RATE_CATEGORIES: RateCategory[] = [
  { key: 'hotel', label: 'Khách sạn', icon: '🏨' },
  { key: 'transport', label: 'Vận chuyển', icon: '🚌' },
  { key: 'staff', label: 'HDV / Nhân sự', icon: '🎤' },
  { key: 'visa', label: 'Visa quốc tế', icon: '🛂' },
  { key: 'insurance', label: 'Bảo hiểm', icon: '🛡️' },
  { key: 'dmc', label: 'DMC', icon: '🌐' },
  { key: 'logistics', label: 'Logistics', icon: '📦' },
  { key: 'gala', label: 'Gala Dinner', icon: '🎉' },
  { key: 'teambuild', label: 'Team Building', icon: '🏕️' },
  { key: 'meeting', label: 'Meeting / Hội nghị', icon: '💼' },
];
