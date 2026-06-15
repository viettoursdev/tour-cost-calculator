import type { CategoryId, Item, QuoteStatus, Template } from '@/types';

// Trạng thái báo giá (pipeline bán) — nhãn + màu theo tính chất.
export const QUOTE_STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  in_progress:  { label: 'Đang triển khai',      color: '#2563eb' },
  sent:         { label: 'Đã gửi khách hàng',    color: '#0891b2' },
  negotiating:  { label: 'Đang deal giá',        color: '#f5a623' },
  won:          { label: 'Thành công',           color: '#27ae60' },
  not_selected: { label: 'Không được lựa chọn',  color: '#dc3250' },
  cancelled:    { label: 'Huỷ',                  color: '#64748b' },
};

export const QUOTE_STATUS_ORDER: QuoteStatus[] =
  ['in_progress', 'sent', 'negotiating', 'won', 'not_selected', 'cancelled'];

// Currency rates (default values; user can override per quote).
// Source: public/legacy.html:1397
export const RATES_INIT: Record<string, number> = {
  VND: 1, USD: 25400, EUR: 27800, JPY: 165, GBP: 32500,
  SGD: 19200, THB: 720, CNY: 3500, KRW: 18.5, AUD: 16800,
};

export type CategoryDef = {
  id: CategoryId;
  icon: string;
  label: string;          // Vietnamese label
  labelEn: string;
  color: string;          // hex
  rateCard?: string;      // matching key in rateCardStore
  domesticOnly?: boolean;
  dmcOnly?: boolean;
};

// Source: public/legacy.html:1567-1582
export const CATS: CategoryDef[] = [
  { id: 'flight',     icon: '✈️',  label: 'Vé máy bay',        labelEn: 'Flight tickets',    color: '#3498db' },
  { id: 'hotel',      icon: '🏨',  label: 'Khách sạn',         labelEn: 'Hotel',             color: '#f5a623', rateCard: 'hotel' },
  { id: 'transport',  icon: '🚌',  label: 'Vận chuyển',        labelEn: 'Transportation',    color: '#9b59b6', rateCard: 'transport' },
  { id: 'meal',       icon: '🍽️', label: 'Ăn uống',           labelEn: 'Meals',             color: '#14a08c' },
  { id: 'sight',      icon: '🎟️', label: 'Tham quan',         labelEn: 'Sightseeing',       color: '#e74c3c', rateCard: 'sight' },
  { id: 'event',      icon: '🎉',  label: 'Sự kiện',           labelEn: 'Event',             color: '#e84393', dmcOnly: true },
  { id: 'meeting',    icon: '📊',  label: 'Meeting / Hội nghị', labelEn: 'Meeting / Conference', color: '#34495e', rateCard: 'meeting', domesticOnly: true },
  { id: 'teambuild',  icon: '🎯',  label: 'Team Building',     labelEn: 'Team Building',     color: '#27ae60', rateCard: 'teambuild', domesticOnly: true },
  { id: 'gala',       icon: '🎆',  label: 'Gala Dinner',       labelEn: 'Gala Dinner',       color: '#c0392b', rateCard: 'gala' },
  { id: 'logistics',  icon: '📦',  label: 'Logistics & Sản xuất', labelEn: 'Logistics & Production', color: '#e67e22', rateCard: 'logistics' },
  { id: 'staff',      icon: '👥',  label: 'Nhân sự',           labelEn: 'Staff',             color: '#dc3250', rateCard: 'staff' },
  { id: 'insurance',  icon: '🛡️', label: 'Bảo hiểm',          labelEn: 'Insurance',         color: '#16a085', rateCard: 'insurance' },
  { id: 'visa',       icon: '🛂',  label: 'Visa',              labelEn: 'Visa',              color: '#1abc9c', rateCard: 'visa' },
  { id: 'dmc',        icon: '🌐',  label: 'DMC – Package đối tác', labelEn: 'DMC Package',   color: '#8e44ad', rateCard: 'dmc' },
  { id: 'service_fee',icon: '💼',  label: 'Phí dịch vụ',       labelEn: 'Service Fee',       color: '#7f8c8d', dmcOnly: true },
  { id: 'other',      icon: '🧩',  label: 'Chi phí khác',      labelEn: 'Other costs',       color: '#95a5a6', dmcOnly: true },
];

export const DMC_CAT_IDS: CategoryId[] = ['hotel', 'transport', 'meal', 'sight', 'event', 'staff', 'service_fee', 'other'];

// Source: public/legacy.html:1586-1589
export function getCATS(template: Template): CategoryDef[] {
  if (template === 'dmc') return CATS.filter(c => DMC_CAT_IDS.includes(c.id));
  return CATS.filter(c => (!c.domesticOnly || template === 'domestic') && !c.dmcOnly);
}

// Source: public/legacy.html:1591
export const UNITS: string[] = [
  '/người', '/ngày', '/bữa', '/đêm',
  '/xe', '/xe/ngày', '/suất', '/chuyến', '/buổi', '/vé',
  'cả đoàn', 'cố định',
];

// Item id generator. Module-scoped counter; matches legacy `let _id=5000; const nid=()=>++_id;`
// Note: id collision across pages is harmless because items are addressed within a single draft's
// catId+id namespace, never globally.
let _id = 5000;
export const nid = (): number => ++_id;

// Item factory. Matches public/legacy.html:1597 `mkItem`.
export const mkItem = (o: Partial<Item> = {}): Item => ({
  id: nid(),
  name: '',
  note: '',
  cur: 'USD',
  price: 0,
  times: 1,
  qtyMode: 'per_pax',
  customQty: 1,
  unit: '/người',
  enabled: true,
  foc: false,
  ...o,
});

// Template seed factories. Source: public/legacy.html:1600-1656.

export type SeedFactory = (pax: number) => Partial<Record<CategoryId, Item[]>>;

// Source: public/legacy.html:1600-1623
export const TPL_DOMESTIC: SeedFactory = (pax) => ({
  flight: [mkItem({ name: 'Vé máy bay nội địa khứ hồi', cur: 'VND', price: 1800000, unit: '/người', qtyMode: 'per_pax', note: 'VietnamAirlines/Bamboo, phổ thông' })],
  hotel: [mkItem({ name: 'Khách sạn 4★', cur: 'VND', price: 1200000, unit: '/đêm', qtyMode: 'custom', customQty: Math.ceil(pax / 2), times: 2, note: 'Phòng đôi/twin, gồm ăn sáng' })],
  transport: [
    mkItem({ name: 'Xe đón sân bay', cur: 'VND', price: 2500000, unit: '/chuyến', qtyMode: 'custom', customQty: 1, note: 'Xe 29 chỗ' }),
    mkItem({ name: 'Xe tham quan', cur: 'VND', price: 5500000, unit: '/xe/ngày', qtyMode: 'custom', customQty: 1, times: 2, note: 'Xe 45 chỗ, máy lạnh' }),
  ],
  meal: [
    mkItem({ name: 'Bữa trưa', cur: 'VND', price: 250000, unit: '/bữa', qtyMode: 'per_pax', times: 2, note: 'Set menu địa phương' }),
    mkItem({ name: 'Bữa tối', cur: 'VND', price: 350000, unit: '/bữa', qtyMode: 'per_pax', times: 2, note: 'Nhà hàng đặc sản' }),
  ],
  sight: [mkItem({ name: 'Vé tham quan', cur: 'VND', price: 200000, unit: '/người', qtyMode: 'per_pax', note: '' })],
  visa: [mkItem({ name: 'Không áp dụng', cur: 'VND', price: 0, unit: '/người', enabled: false, note: 'Tour nội địa không cần visa' })],
  insurance: [mkItem({ name: 'BH du lịch nội địa', cur: 'VND', price: 50000, unit: '/người', qtyMode: 'per_pax', note: 'Mức BH 50 triệu VND' })],
  dmc: [mkItem({ name: 'Không áp dụng', cur: 'VND', price: 0, unit: '/người', enabled: false, note: 'Tour nội địa' })],
  staff: [
    mkItem({ name: 'Hướng dẫn viên', cur: 'VND', price: 650000, unit: '/ngày', qtyMode: 'custom', customQty: 1, times: 3, note: 'HDV tiếng Việt' }),
    mkItem({ name: 'Điều hành', cur: 'VND', price: 1000000, unit: '/ngày', qtyMode: 'custom', customQty: 1, times: 3, note: 'Coordinator on-site' }),
  ],
  logistics: [mkItem({ name: 'Travel kit cơ bản', cur: 'VND', price: 120000, unit: '/người', qtyMode: 'per_pax', note: 'Túi + nón + áo + sổ tay' })],
  gala: [mkItem({ name: 'Gala dinner', cur: 'VND', price: 750000, unit: '/bữa', qtyMode: 'per_pax', enabled: false, note: 'Set menu 5 món + nước uống' })],
  teambuild: [mkItem({ name: 'Team building 1 ngày', cur: 'VND', price: 550000, unit: '/người', qtyMode: 'per_pax', enabled: false, note: 'Activity outdoor + GM + đạo cụ' })],
  meeting: [mkItem({ name: 'Phòng meeting half-day', cur: 'VND', price: 12000000, unit: 'cố định', qtyMode: 'per_group', enabled: false, note: 'Capacity 30-50 khách' })],
});

// Source: public/legacy.html:1625-1646
export const TPL_INTL: SeedFactory = (pax) => ({
  flight: [mkItem({ name: 'Vé quốc tế (Economy)', cur: 'USD', price: 550, unit: '/người', qtyMode: 'per_pax', note: 'Khứ hồi, hạng phổ thông' })],
  hotel: [mkItem({ name: 'Khách sạn 4★', cur: 'USD', price: 120, unit: '/đêm', qtyMode: 'custom', customQty: Math.ceil(pax / 2), times: 4, note: 'Twin room, gồm ăn sáng' })],
  transport: [
    mkItem({ name: 'Xe đón sân bay', cur: 'USD', price: 200, unit: '/chuyến', qtyMode: 'custom', customQty: 1, note: 'Coach tại điểm đến' }),
    mkItem({ name: 'Xe tham quan', cur: 'USD', price: 350, unit: '/xe/ngày', qtyMode: 'custom', customQty: 1, times: 4, note: 'Coach đời mới' }),
  ],
  meal: [
    mkItem({ name: 'Bữa trưa', cur: 'USD', price: 18, unit: '/bữa', qtyMode: 'per_pax', times: 4, note: 'Set menu địa phương' }),
    mkItem({ name: 'Bữa tối', cur: 'USD', price: 25, unit: '/bữa', qtyMode: 'per_pax', times: 4, note: 'Nhà hàng đặc sản' }),
  ],
  sight: [mkItem({ name: 'Vé tham quan', cur: 'USD', price: 25, unit: '/người', qtyMode: 'per_pax', note: '' })],
  visa: [mkItem({ name: 'Phí Visa', cur: 'USD', price: 60, unit: '/người', qtyMode: 'per_pax', note: 'Đã gồm phí dịch vụ' })],
  insurance: [mkItem({ name: 'BH Quốc tế Tiêu chuẩn', cur: 'VND', price: 200000, unit: '/người', qtyMode: 'per_pax', note: 'Mức BH 50K USD' })],
  dmc: [mkItem({ name: 'DMC Package', cur: 'USD', price: 0, unit: '/người', enabled: false, note: 'Land tour từ đối tác địa phương' })],
  staff: [
    mkItem({ name: 'HDV Trưởng đoàn', cur: 'VND', price: 2500000, unit: '/ngày', qtyMode: 'custom', customQty: 1, times: 5, note: 'Đã gồm phụ cấp' }),
    mkItem({ name: 'Điều hành Outbound', cur: 'VND', price: 1800000, unit: '/ngày', qtyMode: 'custom', customQty: 1, times: 5, note: 'On-site' }),
  ],
  logistics: [mkItem({ name: 'Travel kit quốc tế', cur: 'VND', price: 250000, unit: '/người', qtyMode: 'per_pax', note: 'Túi + sim card + tag + áo' })],
  gala: [mkItem({ name: 'Gala dinner tại KS', cur: 'USD', price: 55, unit: '/bữa', qtyMode: 'per_pax', enabled: false, note: 'Set menu Western fine dining' })],
});

// Source: public/legacy.html:1648-1656
export const TPL_DMC: SeedFactory = (pax) => ({
  hotel: [mkItem({ name: 'Khách sạn', cur: 'USD', price: 0, unit: '/đêm', qtyMode: 'custom', customQty: Math.ceil(pax / 2), times: 1, note: 'Twin room' })],
  transport: [mkItem({ name: 'Xe tham quan', cur: 'USD', price: 0, unit: '/xe/ngày', qtyMode: 'custom', customQty: 1, times: 1, note: '' })],
  meal: [
    mkItem({ name: 'Ăn sáng', cur: 'USD', price: 0, unit: '/bữa', qtyMode: 'per_pax', times: 1, note: '' }),
    mkItem({ name: 'Ăn trưa & tối', cur: 'USD', price: 0, unit: '/bữa', qtyMode: 'per_pax', times: 1, note: '' }),
  ],
  sight: [mkItem({ name: 'Tham quan', cur: 'USD', price: 0, unit: '/người', qtyMode: 'per_pax', times: 1, note: '' })],
  staff: [mkItem({ name: 'HDV địa phương', cur: 'USD', price: 0, unit: '/ngày', qtyMode: 'custom', customQty: 1, times: 1, note: '' })],
  service_fee: [mkItem({ name: 'Phí dịch vụ', cur: 'USD', price: 0, unit: '/người', qtyMode: 'per_pax', times: 1, note: '' })],
});

export type TemplateDef = {
  key: Template;
  label: string;
  icon: string;
  desc: string;
  kind?: 'standard' | 'alt';
  init?: SeedFactory;
  sample?: { name: string; dest: string; days: number; nights: number };
};

// Source: public/legacy.html:1658-1666.
export const TEMPLATES: Record<Template, TemplateDef> = {
  domestic:  { key: 'domestic',  label: 'Báo giá tour nội địa',     icon: '🇻🇳', desc: 'Tour trong nước Việt Nam', init: TPL_DOMESTIC, sample: { name: 'Tour Đà Nẵng', dest: 'Đà Nẵng', days: 3, nights: 2 } },
  intl:      { key: 'intl',      label: 'Báo giá tour nước ngoài',  icon: '🌏', desc: 'Outbound tour quốc tế',   init: TPL_INTL,     sample: { name: 'Tour Nhật Bản', dest: 'Nhật Bản', days: 5, nights: 4 } },
  dmc:       { key: 'dmc',       label: 'Breakdown báo giá DMC',    icon: '📋', desc: 'Phân tích chi phí & so sánh với giá DMC', init: TPL_DMC, sample: { name: 'DMC Package', dest: '', days: 5, nights: 4 } },
  itinerary: { key: 'itinerary', label: 'Chương trình tour',        icon: '🗺️', desc: 'Tạo lịch trình tour theo ngày, xuất Word', kind: 'alt' },
  menu:      { key: 'menu',      label: 'Thư viện thực đơn',        icon: '🍽️', desc: 'Quản lý thực đơn theo nhà hàng, xuất Word/PDF', kind: 'alt' },
  visa:         { key: 'visa',         label: 'Quản lý Visa',  icon: '🛂', desc: 'Bảng giá visa & hồ sơ thủ tục', kind: 'alt' },
  doctranslate: { key: 'doctranslate', label: 'Dịch hồ sơ',    icon: '📑', desc: 'Dịch Word/PDF/scan Việt → Anh, giữ bố cục sạch', kind: 'alt' },
};
