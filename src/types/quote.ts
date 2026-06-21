export type CategoryId =
  | 'flight' | 'hotel' | 'transport' | 'meal' | 'sight' | 'meeting'
  | 'teambuild' | 'gala' | 'logistics' | 'staff' | 'insurance'
  | 'visa' | 'dmc' | 'service_fee' | 'event' | 'other';

export type Template = 'domestic' | 'intl' | 'dmc' | 'itinerary' | 'menu' | 'visa' | 'doctranslate' | 'guideschedule';

/** File đính kèm lưu trên R2 (qua AI Worker). `uploadedBy`/`uploadedAt` ghi
 *  lại tài khoản và thời điểm thao tác lưu file (dữ liệu cũ có thể thiếu). */
export type FileAttachment = {
  key: string;
  name: string;
  uploadedBy?: string;
  uploadedAt?: string;
};

export type OutputCurrency =
  | 'VND' | 'USD' | 'EUR' | 'JPY' | 'SGD' | 'KRW' | 'THB' | 'GBP' | 'AUD' | 'CNY';

export type DmcMargin = {
  type: 'percent' | 'fixed';   // percent of totalCostVND, or fixed in outputCurrency
  value: number;
};

export type DmcPrices = Record<number, number>;  // keys at runtime: 20, 25, 30, 35, 40

export type QtyMode = 'per_pax' | 'per_group' | 'custom' | 'single_room' | 'double_room' | 'package' | 'room';

export type Item = {
  id: number;
  name: string;
  note: string;
  cur: string;
  price: number;
  times: number;
  qtyMode: QtyMode;
  customQty: number;
  unit: string;
  enabled: boolean;
  foc: boolean;
  optional?: boolean;   // excluded from totals; shown as an optional add-on
  included?: boolean;   // "Đã gồm" — đã bao gồm trong giá khác; không cộng vào tổng
};

export type QuoteInfo = {
  name: string;
  dest: string;
  days: number;
  nights: number;
  startDate: string | null;
};

/** A payment instalment shown on the quote (đợt 1, đợt 2…). */
export type QuotePayment = {
  id: string;
  label: string;     // e.g. "Đợt 1 – Cọc giữ chỗ"
  amount: number;    // fixed amount in VND (0 = unspecified)
  note: string;      // condition / due, e.g. "Trong vòng 07 ngày sau khi ký HĐ"
};

/** A pricing modifier: % of adult package price, or a fixed VND amount. */
export type PriceMod = {
  enabled: boolean;
  mode: 'percent' | 'fixed';
  value: number;     // percent (of adult price/pax) or fixed VND
};

/** Optional pricing add-ons shown in Tổng kết & on the package PDF. */
export type QuotePricingOptions = {
  singleSupp: PriceMod;   // Phụ thu phòng đơn
  infant: PriceMod;       // Trẻ em dưới 2 tuổi
  child: PriceMod;        // Trẻ em 2–12 tuổi
  tips: PriceMod;         // Tips / khách
  extras: { id: string; label: string; mode: 'percent' | 'fixed'; value: number }[];
};

/** A group-size variant: its own pax, line items and category toggles. */
export type QuoteGroup = {
  id: string;
  label: string;   // e.g. "20 khách"
  pax: number;
  items: Partial<Record<CategoryId, Item[]>>;
  catEnabled: Record<CategoryId, boolean>;
};

/** Trạng thái pipeline bán của một báo giá. */
export type QuoteStatus =
  | 'in_progress'    // Đang triển khai
  | 'sent'           // Đã gửi khách hàng
  | 'negotiating'    // Đang deal giá
  | 'won'            // Thành công
  | 'not_selected'   // Không được lựa chọn
  | 'cancelled';     // Huỷ

/** Loại yêu cầu báo giá: khách hỏi giá (Request tour) hay dự thầu (Thầu). */
export type QuoteRequestKind = 'request' | 'thau';

/** Thông tin nhập ở bảng "Tạo báo giá mới" (trước khi mở bảng giá). */
export type NewQuoteMeta = {
  request?: QuoteRequestKind;
  name: string;
  customerId?: string;
  customerName?: string;
  pax?: number;
  days: number;
  nights: number;
  startDate?: string | null;
  deadline?: string;
  collaborators?: Collaborator[];
};

/** Một hạng giá tạm tính của chuyến bay (đa tiền tệ). */
export type FlightFare = { id: string; label: string; amount: number; cur: string };

/** Một CHẶNG bay (một lượt cất–hạ cánh) trong một booking. */
export type FlightSegment = {
  date: string;          // Ngày khởi hành dạng DD/MMM (vd "20NOV")
  flightNo: string;      // Số hiệu (vd "QR977")
  airlineCode?: string;  // Tiền tố hãng (vd "QR") — suy từ flightNo
  airlineName?: string;  // Tên hãng (vd "Qatar Airways")
  depAirport: string;    // IATA điểm đi (vd "HAN")
  arrAirport: string;    // IATA điểm đến (vd "DOH")
  depCity?: string;      // Tên điểm đi (vd "Hanoi")
  arrCity?: string;
  depTime: string;       // Giờ khởi hành HH:MM
  arrTime: string;       // Giờ đáp HH:MM
  depDayOffset?: number; // +N ngày trên giờ khởi hành (qua đêm); 0/không = cùng ngày
  arrDayOffset?: number; // +N ngày trên giờ đáp
};

/** Một BOOKING vé máy bay trong tab Thông tin chuyến bay của báo giá.
 *  Mỗi booking gồm 1..N chặng (1 chiều, khứ hồi, hay đa chặng trên cùng mã đặt
 *  chỗ) và một/nhiều hạng giá tạm tính. Hệ thống tự nhận diện số chặng từ input. */
export type QuoteFlight = {
  id: string;
  segments: FlightSegment[];
  fares: FlightFare[];
  note?: string;
};

/** Hình dạng dữ liệu chuyến bay CŨ (phẳng + chiều về ret*) — chỉ để migrate. */
export type LegacyQuoteFlight = {
  id: string;
  date?: string; flightNo?: string; airlineCode?: string; airlineName?: string;
  depAirport?: string; arrAirport?: string; depCity?: string; arrCity?: string;
  depTime?: string; arrTime?: string; depDayOffset?: number; arrDayOffset?: number;
  retDate?: string; retFlightNo?: string; retDepAirport?: string; retArrAirport?: string;
  retDepTime?: string; retArrTime?: string; retDepDayOffset?: number; retArrDayOffset?: number;
  segments?: FlightSegment[];
  fares?: FlightFare[];
  note?: string;
};

/** Một khách trong đoàn (manifest + rooming list của báo giá). */
export type Passenger = {
  id: string;
  name: string;
  gender?: 'M' | 'F' | '';
  dob?: string;          // ngày sinh (DD/MM/YYYY)
  idType?: 'passport' | 'cccd' | '';
  idNo?: string;         // số hộ chiếu / CCCD
  nationality?: string;
  roomType?: 'single' | 'double' | 'twin' | 'triple' | '';
  roomNo?: string;       // nhãn/số phòng để ghép khách ở chung
  dietary?: string;      // ăn kiêng / dị ứng
  phone?: string;
  emergency?: string;    // liên hệ khẩn cấp (tên + sđt)
  note?: string;
};

/** Trạng thái một bước trong quy trình vận hành (4 cột Kanban). */
export type WorkflowStatus = 'todo' | 'doing' | 'done' | 'blocked' | 'skipped';

/** Một dòng nhật ký hoạt động của bước quy trình. */
export type WorkflowLogEntry = {
  at: string;    // ISO timestamp
  by: string;    // tên người thao tác
  action: string; // mô tả ngắn (vd "Trạng thái → Hoàn tất")
};

/** Một bước trong quy trình vận hành của báo giá. */
export type WorkflowStep = {
  id: string;
  label: string;
  status: WorkflowStatus;
  key?: string;               // khoá ổn định (đổi tên vẫn nhận tín hiệu auto) — bước mặc định
  dueOffset?: number;         // hạn = N ngày TRƯỚC khởi hành (âm = sau khởi hành)
  startDate?: string | null;  // ISO yyyy-mm-dd (cho Gantt)
  dueDate?: string | null;
  doneDate?: string | null;
  assignee?: string;          // username người phụ trách
  note?: string;
  log?: WorkflowLogEntry[];   // nhật ký thay đổi (giữ tối đa 50 dòng gần nhất)
  attachments?: FileAttachment[]; // file đính kèm theo bước (R2 qua AI Worker)
};

export type QuoteDraft = {
  template: Template | null;
  info: QuoteInfo;
  pax: number;
  rates: Record<string, number>;
  /** Tiền tệ HIỂN THỊ của bảng tỷ giá ('VND' mặc định). Chỉ đổi cách hiển thị —
   *  `rates` luôn quy về VND. Dùng cho báo giá nước ngoài & DMC breakdown. */
  rateBase?: string;
  margin: number;
  vat: number;
  svcBasis: number;
  rounding: number;
  items: Partial<Record<CategoryId, Item[]>>;
  catEnabled: Record<CategoryId, boolean>;
  currentQuoteId: string | null;
  status?: QuoteStatus;    // Trạng thái báo giá (pipeline bán)
  lossReason?: string;     // Lý do thua (khi status = not_selected/cancelled)
  request?: QuoteRequestKind; // Loại yêu cầu (Request tour / Thầu) — nhập khi tạo
  deadline?: string;       // Hạn hoàn thành báo giá (ISO datetime) — hệ thống nhắc trước 1 ngày & 6 giờ
  // Thông tin khách & cộng tác viên nhập lúc tạo, mang sang hộp thoại Lưu cloud.
  customerId?: string;
  customerName?: string;
  pendingCollaborators?: Collaborator[];
  flights?: QuoteFlight[]; // Thông tin chuyến bay của báo giá
  workflow?: WorkflowStep[]; // Quy trình vận hành của báo giá
  passengers?: Passenger[]; // Danh sách khách đoàn (manifest + rooming)
  catOrder?: CategoryId[];  // Thứ tự hiển thị hạng mục (kéo-thả); thiếu = thứ tự mặc định

  // Customer-facing terms (optional — absent until edited).
  inclusions?: string[];   // Giá bao gồm
  exclusions?: string[];   // Giá không bao gồm
  payments?: QuotePayment[]; // Thông tin thanh toán theo đợt
  pricingOptions?: QuotePricingOptions; // Phụ thu / trẻ em / tips…
  // Multi group-size mode. When groups is present (length ≥ 1), the top-level
  // pax/items/catEnabled mirror the active group (activeGroupId).
  groups?: QuoteGroup[];
  activeGroupId?: string;
  // DMC template only — undefined for regular drafts.
  outputCurrency?: OutputCurrency;
  dmcPrices?: DmcPrices;
  dmcMargin?: DmcMargin;
  // Đề nghị tạm ứng & quyết toán tour (optional — absent cho tới khi tạo).
  advance?: TourAdvance;
};

// ── Đề nghị tạm ứng & Quyết toán tour ──
export interface AdvanceLine {
  id: string;
  name: string;
  note?: string;
  unit?: string;
  qty: number;     // số lượng
  price: number;   // đơn giá (theo `cur`, mặc định VND)
  /** Mã ngoại tệ của đơn giá (vd USD). Trống = VND. Quy đổi qua draft.rates. */
  cur?: string;
  /** Số tiền QUYẾT TOÁN thực tế — VND. Trống = dùng dự toán đã quy đổi. */
  actual?: number;
}

/** draft → tam_ung (đã gửi duyệt, chờ/đã tạm ứng) → quyet_toan (đã quyết toán, đóng case). */
export type AdvanceStatus = 'draft' | 'tam_ung' | 'quyet_toan';

export interface TourAdvance {
  status: AdvanceStatus;
  /** Chi phí đi tour (có rate card). */
  tourCosts: AdvanceLine[];
  /** Chi phí thanh toán khác. */
  otherCosts: AdvanceLine[];
  /** Số tiền đề nghị tạm ứng (VND). */
  advanceRequested: number;
  note?: string;
  /** Hai người duyệt — chỉnh được cả sau khi đã gửi yêu cầu duyệt. */
  approver1?: { u: string; name: string };
  approver2?: { u: string; name: string };
  requestedBy?: string;
  requestedAt?: string;
  settledBy?: string;
  settledAt?: string;
  /** Thread duyệt chung (cả người đề nghị & 2 người duyệt cùng thấy trạng thái). */
  threadId?: string;
}

export type Snapshot = {
  id: number;
  cloudId: string;
  name: string;
  date: string;
  savedBy: string;
  state: QuoteDraft;
};

export type SavedQuotesByUser = Record<string, Snapshot[]>;

export type Collaborator = {
  u: string;
  name: string;
};

export type QuoteVersion = {
  versionNo: number;
  savedAt: string;     // ISO
  savedBy: string;     // "Tony (CEO)"
  note: string;
  state: QuoteDraft;
};

export type CloudQuoteEntry = {
  id: number;
  cloudId: string;
  quoteCode: string;
  name: string;
  template: Template;
  pax: number;
  totalCost: number;
  customerId?: string;
  customerName?: string;
  status?: QuoteStatus;
  /** Loại yêu cầu (Request tour / Thầu) — index cho lọc & thống kê. */
  request?: QuoteRequestKind;
  /** Hạn hoàn thành báo giá (ISO datetime) — để nhắc deadline toàn hệ thống. */
  deadline?: string;
  /** Lý do thua deal (khi status = not_selected/cancelled) — cho phân tích. */
  lossReason?: string;
  /** Ngày khởi hành (ISO yyyy-mm-dd) — index cho Lịch khởi hành. */
  departDate?: string;
  /** Số ngày của tour — để suy ra ngày về (= khởi hành + (days-1)). */
  days?: number;
  /** Tóm tắt bước quy trình có hạn & chưa xong — để nhắc deadline toàn hệ thống. */
  workflowDue?: { label: string; dueDate: string; assignee?: string }[];
  /** Tóm tắt tiến độ quy trình cho Bảng điều phối toàn hệ thống. */
  workflowSummary?: { current?: string; currentAssignee?: string; donePct: number; total: number; overdue: number };
  /** Tóm tắt công nợ phải trả NCC (VND) — cho Bảng công nợ tổng. */
  paymentSummary?: { payable: number; paid: number; remaining: number };
  /** Các đợt thanh toán NCC chưa trả & có hạn — để nhắc đến hạn trả NCC. */
  nccDue?: { supplier?: string; label: string; amount: number; dueDate: string }[];
  createdByUsername: string;
  createdByName: string;
  collaborators: Collaborator[];
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  /** @deprecated Dùng `attachments`. File đính kèm đơn (dữ liệu cũ). */
  attachment?: FileAttachment;
  /** Nhiều file đính kèm cho báo giá (lưu trên R2 qua AI Worker). */
  attachments?: FileAttachment[];
  /** Liên kết chéo DMC ↔ báo giá nước ngoài: cloudId của bản ghi đối ứng. */
  linkedQuoteId?: string;
  linkedQuoteName?: string;
  linkedQuoteTemplate?: Template;
};

export type CloudQuoteProject = {
  versions: QuoteVersion[];
  currentState: QuoteDraft;
  collaborators: Collaborator[];
  updatedAt: string;
  updatedBy: string;
};
