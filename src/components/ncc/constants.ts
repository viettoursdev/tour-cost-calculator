export const NCC_SECTORS: string[] = [
  'Khách sạn', 'DMC', 'Tourism Board', 'Hàng không', 'Event', 'Venue', 'Transport',
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

export const SECTOR_COLOR: Record<string, string> = {
  'Khách sạn':           '#f5a623',
  'DMC':                 '#8e44ad',
  'Tourism Board':       '#1abc9c',
  'Hàng không':          '#2980b9',
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
