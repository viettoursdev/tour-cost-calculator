export const NCC_SECTORS: string[] = [
  'Khách sạn', 'DMC', 'Tourism Board', 'Hàng không', 'Du thuyền', 'Tham quan', 'Event', 'Venue', 'Transport',
  'Nhà hàng', 'Bảo hiểm', 'Logistics', 'Visa', 'Âm thanh – Ánh sáng',
  'In ấn & Quà tặng', 'Khác',
];

export const NCC_CONTINENTS: string[] = ['Châu Á', 'Châu Âu', 'Châu Mỹ', 'Châu Phi', 'Châu Đại Dương'];

/** Quốc gia theo châu lục (Việt Nam đứng đầu Châu Á cho NCC nội địa). */
export const NCC_COUNTRIES: Record<string, string[]> = {
  'Châu Á': ['Việt Nam', 'Trung Quốc', 'Nhật Bản', 'Hàn Quốc', 'Thái Lan', 'Singapore', 'Malaysia', 'Indonesia', 'Campuchia', 'Lào', 'Ấn Độ', 'UAE/Dubai', 'Đài Loan', 'Hồng Kông', 'Philippines'],
  'Châu Âu': ['Pháp', 'Anh', 'Đức', 'Ý', 'Tây Ban Nha', 'Thụy Sĩ', 'Hà Lan', 'Nga', 'Áo', 'Bỉ'],
  'Châu Mỹ': ['Mỹ', 'Canada', 'Brazil', 'Mexico', 'Argentina'],
  'Châu Phi': ['Ai Cập', 'Nam Phi', 'Morocco', 'Kenya'],
  'Châu Đại Dương': ['Úc', 'New Zealand'],
};

/** Danh sách phẳng tất cả quốc gia (cho ô lọc khi chưa chọn châu lục). */
export const NCC_ALL_COUNTRIES: string[] = Object.values(NCC_COUNTRIES).flat();

/** Quốc gia → châu lục (đảo từ NCC_COUNTRIES). */
export const COUNTRY_TO_CONTINENT: Record<string, string> = Object.entries(NCC_COUNTRIES)
  .reduce<Record<string, string>>((acc, [cont, countries]) => {
    countries.forEach((c) => { acc[c.toLowerCase()] = cont; });
    return acc;
  }, {});

/** Thành phố/địa danh phổ biến → quốc gia (để auto suy ra Quốc gia + Châu lục). */
const CITY_TO_COUNTRY: Record<string, string> = {
  // Việt Nam
  'hà nội': 'Việt Nam', 'hanoi': 'Việt Nam', 'hồ chí minh': 'Việt Nam', 'tphcm': 'Việt Nam', 'sài gòn': 'Việt Nam', 'saigon': 'Việt Nam', 'đà nẵng': 'Việt Nam', 'danang': 'Việt Nam', 'nha trang': 'Việt Nam', 'phú quốc': 'Việt Nam', 'đà lạt': 'Việt Nam', 'hội an': 'Việt Nam', 'hạ long': 'Việt Nam', 'huế': 'Việt Nam', 'sapa': 'Việt Nam',
  // Châu Á
  'bangkok': 'Thái Lan', 'phuket': 'Thái Lan', 'pattaya': 'Thái Lan', 'chiang mai': 'Thái Lan',
  'tokyo': 'Nhật Bản', 'osaka': 'Nhật Bản', 'kyoto': 'Nhật Bản', 'nagoya': 'Nhật Bản', 'hokkaido': 'Nhật Bản', 'sapporo': 'Nhật Bản', 'narita': 'Nhật Bản', 'nrt': 'Nhật Bản', 'hnd': 'Nhật Bản',
  'seoul': 'Hàn Quốc', 'busan': 'Hàn Quốc', 'jeju': 'Hàn Quốc', 'incheon': 'Hàn Quốc', 'icn': 'Hàn Quốc',
  'singapore': 'Singapore',
  'kuala lumpur': 'Malaysia', 'penang': 'Malaysia', 'langkawi': 'Malaysia',
  'bali': 'Indonesia', 'jakarta': 'Indonesia',
  'bắc kinh': 'Trung Quốc', 'beijing': 'Trung Quốc', 'thượng hải': 'Trung Quốc', 'shanghai': 'Trung Quốc', 'quảng châu': 'Trung Quốc', 'thành đô': 'Trung Quốc',
  'đài bắc': 'Đài Loan', 'taipei': 'Đài Loan', 'cao hùng': 'Đài Loan',
  'hong kong': 'Hồng Kông', 'hồng kông': 'Hồng Kông',
  'dubai': 'UAE/Dubai', 'abu dhabi': 'UAE/Dubai',
  'siem reap': 'Campuchia', 'phnom penh': 'Campuchia',
  // Châu Âu
  'paris': 'Pháp', 'nice': 'Pháp', 'lyon': 'Pháp',
  'london': 'Anh', 'manchester': 'Anh',
  'berlin': 'Đức', 'munich': 'Đức', 'frankfurt': 'Đức',
  'rome': 'Ý', 'milan': 'Ý', 'venice': 'Ý', 'florence': 'Ý',
  'madrid': 'Tây Ban Nha', 'barcelona': 'Tây Ban Nha',
  'zurich': 'Thụy Sĩ', 'geneva': 'Thụy Sĩ',
  'amsterdam': 'Hà Lan',
  // Châu Mỹ
  'new york': 'Mỹ', 'los angeles': 'Mỹ', 'las vegas': 'Mỹ', 'san francisco': 'Mỹ', 'honolulu': 'Mỹ', 'hawaii': 'Mỹ', 'hnl': 'Mỹ', 'washington': 'Mỹ', 'chicago': 'Mỹ', 'orlando': 'Mỹ',
  'toronto': 'Canada', 'vancouver': 'Canada',
  // Châu Đại Dương
  'sydney': 'Úc', 'melbourne': 'Úc', 'brisbane': 'Úc', 'gold coast': 'Úc',
  'auckland': 'New Zealand', 'queenstown': 'New Zealand',
  // Châu Phi
  'cairo': 'Ai Cập', 'cape town': 'Nam Phi', 'johannesburg': 'Nam Phi',
};

/**
 * Suy ra { country, continent } từ địa điểm (thành phố) — ưu tiên khớp tên quốc
 * gia, rồi tới thành phố phổ biến. Trả về rỗng nếu không nhận diện được.
 */
export function deriveLocation(location: string): { country?: string; continent?: string } {
  const s = (location || '').trim().toLowerCase();
  if (!s) return {};
  // 1) Khớp trực tiếp tên quốc gia trong chuỗi.
  for (const country of NCC_ALL_COUNTRIES) {
    if (s.includes(country.toLowerCase())) return { country, continent: COUNTRY_TO_CONTINENT[country.toLowerCase()] };
  }
  // 2) Khớp thành phố phổ biến (theo từ — ưu tiên cụm dài hơn trước).
  const cities = Object.keys(CITY_TO_COUNTRY).sort((a, b) => b.length - a.length);
  for (const city of cities) {
    if (s.includes(city)) {
      const country = CITY_TO_COUNTRY[city];
      return { country, continent: COUNTRY_TO_CONTINENT[country.toLowerCase()] };
    }
  }
  return {};
}

export const SECTOR_COLOR: Record<string, string> = {
  'Khách sạn':           '#f5a623',
  'DMC':                 '#8e44ad',
  'Tourism Board':       '#1abc9c',
  'Hàng không':          '#2980b9',
  'Du thuyền':           '#0ea5e9',
  'Tham quan':           '#e84393',
  'Event':               '#e74c3c',
  'Venue':               '#16a085',
  'Transport':           '#9b59b6',
  'Nhà hàng':            '#e67e22',
  'Bảo hiểm':            '#27ae60',
  'Logistics':           '#d35400',
  'Visa':                '#2c3e50',
  'Âm thanh – Ánh sáng': '#8e44ad',
  'In ấn & Quà tặng':    '#c0392b',
  'Khác':                '#7f8c8d',
};
