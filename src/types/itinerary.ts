export interface Activity {
  id: string;
  time: string;
  text: string;
}

export interface Segment {
  id: string;
  groupLabel: string;
  transport: string;
  activities: Activity[];
}

export interface Day {
  id: string;
  dayNum: number;
  date: string;
  title: string;
  meals: { B: boolean; L: boolean; D: boolean };
  mealNote: string;
  segments: Segment[];
}

export interface Flight {
  id: string;
  group: string;
  leg: string;
  flightNo: string;
  dep: string;   // legacy: "TSN 05:40" (giữ để tương thích; đồng bộ từ 4 trường dưới)
  arr: string;   // legacy: "PEK 11:35"
  depAirport?: string;  // Sân bay khởi hành (vd TSN)
  depTime?: string;     // Giờ bay (vd 05:40)
  arrAirport?: string;  // Sân bay đến (vd PEK)
  arrTime?: string;     // Giờ đáp (vd 11:35)
  depDayOffset?: number; // +N ngày trên giờ bay (qua đêm)
  arrDayOffset?: number; // +N ngày trên giờ đáp
}

export type ItineraryType = 'NN' | 'ND';

// ── Thông tin vận hành (Execution) — cho file Itinerary Execution của HDV ──
export interface ExecContact {
  id: string;
  role: string;     // vai trò / loại (HDV chính, Tài xế, Khách sạn, Điểm tham quan…)
  name: string;
  phone: string;
  note?: string;
}
export interface ExecGuest {
  id: string;
  name: string;
  room?: string;     // phân phòng
  dietary?: string;  // ăn kiêng / dị ứng
  medical?: string;  // lưu ý y tế
  vip?: boolean;
  note?: string;
}
export interface ExecChecklistItem { id: string; text: string; done?: boolean }
export interface ExecDayOps {
  dayNum: number;
  hotelName?: string;
  hotelContact?: string;
  venues?: ExecContact[];
  notes?: string;
  checklist?: ExecChecklistItem[];
}
export interface ExecData {
  sosHotline?: string;
  sosOperator?: string;
  sosInsurance?: string;
  sosEmbassy?: string;
  sosMedical?: string;
  guides?: ExecContact[];
  drivers?: ExecContact[];
  suppliers?: ExecContact[];
  guests?: ExecGuest[];
  guestNotes?: string;
  dayOps?: ExecDayOps[];
  generalNotes?: string;
}

export interface Itinerary {
  id: string;
  code?: string;
  type: ItineraryType;
  continent: string;
  country: string;
  seq: number;
  title: string;
  destination: string;
  days: number;
  nights: number;
  /** Khách hàng gắn với chương trình (optional). */
  customerId?: string;
  customerName?: string;
  /** Ngày khởi hành (ISO yyyy-MM-dd) — để tự điền ngày cho từng Ngày 1..N. */
  startDate?: string;
  intro: string;
  flights: Flight[];
  schedule: Day[];
  includes: string[];
  excludes: string[];
  linkedQuoteId: string | null;
  linkedQuoteName: string;
  /** Thông tin vận hành cho file Itinerary Execution (optional). */
  exec?: ExecData;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/** Một mục trong thư viện thuyết minh điểm tham quan (tái dùng giữa các lịch trình). */
export interface PoiEntry {
  id: string;
  place: string;          // tên địa điểm tham quan
  destination?: string;   // điểm đến / quốc gia (để lọc)
  commentary: string;     // nội dung thuyết minh
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ItineraryIndexEntry {
  id: string;
  code: string;
  title: string;
  destination: string;
  days: number;
  nights: number;
  customerName?: string;
  linkedQuoteId?: string | null;
  linkedQuoteName: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy: string;
}
