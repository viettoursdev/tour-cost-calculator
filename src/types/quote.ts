import type { Department } from './user';
import type { ApplicantDoc, GuestRelation, PassportRecord, VisaApplicantMilestone, VisaApplicantStatus } from './visa';
import type { ContractCancel } from './contract';

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

/**
 * Vai trò giá trị của báo giá trong hồ sơ tour — chọn khi LƯU báo giá để hồ sơ
 * liên kết đúng "mốc": báo giá hiện tại / giá trị ký hợp đồng / chi phí nghiệm thu.
 * Trống = coi như `current` (báo giá hiện tại).
 */
export type QuoteValueRole = 'current' | 'contract' | 'settlement';

/** Nhãn tiếng Việt cho từng vai trò giá trị (dùng chung SaveModal & hồ sơ tour). */
export const QUOTE_VALUE_ROLE_LABEL: Record<QuoteValueRole, string> = {
  current: 'Báo giá hiện tại',
  contract: 'Báo giá hợp đồng',
  settlement: 'CP Nghiệm thu',
};

/** Thông tin nhập ở bảng "Tạo báo giá mới" (trước khi mở bảng giá). */
export type NewQuoteMeta = {
  request?: QuoteRequestKind;
  name: string;
  dest?: string;
  customerId?: string;
  customerName?: string;
  pax?: number;
  days: number;
  nights: number;
  startDate?: string | null;
  deadline?: string;
  collaborators?: Collaborator[];
  /** Gắn báo giá vào hồ sơ tour CÓ SẴN (trống = tự tạo hồ sơ mới khi lưu). */
  tourProfileId?: string;
  /** File Excel báo giá lúc tạo (option "Upload Excel" / "Upload Excel + AI"). */
  excelFile?: FileAttachment;
  /** Khoá trang báo giá (chỉ xem file Excel, không nhập trên app). */
  locked?: boolean;
};

/** Một hạng giá tạm tính của chuyến bay (đa tiền tệ).
 *  `amount` = Fare (giá vé cơ bản, GIỮ tên cũ để tương thích). `tax` = thuế/phí.
 *  Total = amount + tax (suy ra, không lưu). Các trường SL chỗ phục vụ quản lý
 *  block giữ chỗ: đặt cọc / khách đã xác nhận / được phép giảm. */
export type FlightFare = {
  id: string;
  label: string;
  amount: number;          // Fare (giá vé cơ bản)
  tax?: number;            // Thuế & phí
  cur: string;
  seatsDeposit?: number;   // SL chỗ đã đặt cọc
  seatsConfirmed?: number; // SL chỗ khách xác nhận
  seatsReducible?: number; // SL chỗ được phép giảm
};

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

/** Loại phòng — đôi/twin/đơn/triple + nâng hạng VIP/Upgrade. */
export type RoomType = 'single' | 'double' | 'twin' | 'triple' | 'vip' | 'upgrade' | '';

/** Một khách trong đoàn (manifest + rooming list của báo giá; dùng chung cho hồ sơ visa). */
export type Passenger = {
  id: string;
  name: string;
  gender?: 'M' | 'F' | '';
  dob?: string;          // ngày sinh (DD/MM/YYYY)
  idType?: 'passport' | 'cccd' | '';
  idNo?: string;         // số hộ chiếu / CCCD
  nationality?: string;
  roomType?: RoomType;
  roomNo?: string;       // nhãn/số phòng để ghép khách ở chung
  dietary?: string;      // ăn kiêng / dị ứng
  phone?: string;
  emergency?: string;    // liên hệ khẩn cấp (tên + sđt)
  note?: string;
  // ── Bổ sung dùng chung Visa ↔ Báo giá ──
  company?: string;        // Công ty / đơn vị
  departurePoint?: string; // Địa điểm khởi hành (vd Hà Nội, TP.HCM)
  otherFlight?: string;    // Chuyến bay khác (khách bay riêng) — nhập tự do
  // ── Trường hồ sơ visa (optional → báo giá thuần không dùng) ──
  nameNoAccent?: string;      // Họ tên không dấu
  passportIssue?: string;     // Ngày cấp hộ chiếu
  passportExpiry?: string;    // Ngày hết hạn hộ chiếu
  countriesVisited?: string;  // Các quốc gia đã từng đi
  docStatus?: 'missing' | 'submitted' | 'complete';
  result?: 'pending' | 'passed' | 'failed' | 'have_visa';
  visaStatus?: VisaApplicantStatus;        // Tình trạng xin visa hợp nhất (8 mốc)
  visaTimeline?: VisaApplicantMilestone[]; // Timeline riêng của khách
  failReason?: string;        // Lý do rớt (khi result = failed)
  docs?: ApplicantDoc[];      // Checklist hồ sơ visa
  passportHistory?: PassportRecord[]; // Hộ chiếu cũ đã thay
  // ── Liên kết hồ sơ khách hàng (CRM) — gắn khách visa vào Customer/TravelerDoc ──
  customerId?: string;        // legacy id của Customer đã gắn
  customerName?: string;      // tên KH (hiển thị nhanh)
  travelerId?: string;        // id TravelerDoc trong customer (nguồn danh tính)
  relations?: GuestRelation[]; // quan hệ với khách khác trong đoàn
  guardianAuthReady?: boolean; // đã có giấy uỷ quyền đưa trẻ <14 đi (khi không đi cùng cha/mẹ)
};

/** Trạng thái một bước trong quy trình vận hành (4 cột Kanban). */
export type WorkflowStatus = 'todo' | 'doing' | 'done' | 'blocked' | 'skipped';

/** Một dòng nhật ký hoạt động của bước quy trình. */
export type WorkflowLogEntry = {
  at: string;    // ISO timestamp
  by: string;    // tên người thao tác
  action: string; // mô tả ngắn (vd "Trạng thái → Hoàn tất")
};

/** Việc con (checklist) trong 1 bước quy trình. */
export type WorkflowSubtask = { id: string; label: string; done: boolean };

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
  // ── Trường dùng cho Quy trình phòng ban (SOP). Optional → không ảnh hưởng
  //    quy trình vận hành per-báo-giá đã có. ──
  output?: string;            // Đầu ra / bằng chứng của bước (cột SOP)
  risk?: string;              // Điểm kiểm soát rủi ro thường gặp
  ownerDept?: Department;     // Phòng/bộ phận phụ trách bước
  dueRule?: string;           // Hạn dạng chữ: "T-7", "T+3 sau tour", "trong 24h"
  subtasks?: WorkflowSubtask[]; // checklist con trong bước (lưu qua ảnh chụp JSON phiên bản)
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
  /** Hồ sơ tour (Tour Profile) mà báo giá này thuộc về — 1 hồ sơ : N báo giá.
   *  Suy ra qua đường dẫn nếu trống; round-trip qua import/export. */
  tourProfileId?: string;
  tourCode?: string;       // mã hồ sơ tour (tiện hiển thị, suy từ profile)
  status?: QuoteStatus;    // Trạng thái báo giá (pipeline bán)
  valueRole?: QuoteValueRole; // Vai trò giá trị trong hồ sơ tour (hiện tại/hợp đồng/nghiệm thu)
  lossReason?: string;     // Lý do thua (khi status = not_selected/cancelled)
  request?: QuoteRequestKind; // Loại yêu cầu (Request tour / Thầu) — nhập khi tạo
  deadline?: string;       // Hạn hoàn thành báo giá (ISO datetime) — hệ thống nhắc trước 1 ngày & 6 giờ
  // Thông tin khách & cộng tác viên nhập lúc tạo, mang sang hộp thoại Lưu cloud.
  customerId?: string;
  customerName?: string;
  pendingCollaborators?: Collaborator[];
  /** @deprecated Dùng `excelFiles`. File Excel báo giá đơn (dữ liệu cũ). */
  excelFile?: FileAttachment;
  excelFiles?: FileAttachment[]; // Lịch sử file Excel báo giá đã upload (cũ → mới)
  locked?: boolean;        // Khoá trang báo giá (chỉ xem file Excel)
  flights?: QuoteFlight[]; // Thông tin chuyến bay của báo giá
  workflow?: WorkflowStep[]; // Quy trình điều hành của báo giá
  passengers?: Passenger[]; // Danh sách khách đoàn (manifest + rooming)
  catOrder?: CategoryId[];  // Thứ tự hiển thị hạng mục (kéo-thả); thiếu = thứ tự mặc định

  // Customer-facing terms (optional — absent until edited).
  /** Hiệu lực báo giá đến HẾT ngày này (ISO 'YYYY-MM-DD'). Trống = mặc định
   *  N ngày kể từ ngày báo giá (xem `quoteValidity.DEFAULT_VALID_DAYS`). */
  validUntil?: string;
  /** Ngày áp tỷ giá (ISO 'YYYY-MM-DD') — đóng dấu lên bản in & điều khoản biến
   *  động tỷ giá. Tự đóng dấu khi tạo báo giá mới / sửa 1 dòng tỷ giá. */
  rateDate?: string;
  inclusions?: string[];   // Giá bao gồm
  exclusions?: string[];   // Giá không bao gồm
  cancellation?: ContractCancel[]; // Chính sách huỷ tour (mốc thời gian → % phạt)
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

/** Cách thanh toán cho 1 khoản chi khi quyết toán tạm ứng. */
export type AdvancePayMethod = 'cash' | 'company_card' | 'personal_card' | 'other_card' | 'transfer' | 'other';

/** Một khoản chi THỰC TẾ khi quyết toán tạm ứng — có phương thức & ngoại tệ riêng. */
export interface AdvanceSettlePay {
  id: string;
  /** Nội dung khoản chi. */
  name: string;
  note?: string;
  /** Phương thức thanh toán (tiền mặt, thẻ công ty, thẻ cá nhân…). */
  method: AdvancePayMethod;
  /** Mã ngoại tệ của số tiền (vd USD). Trống = VND. Quy đổi qua draft.rates. */
  cur?: string;
  /** Số tiền theo `cur`. */
  amount: number;
}

export interface TourAdvance {
  status: AdvanceStatus;
  /** Chi phí đi tour (có rate card). */
  tourCosts: AdvanceLine[];
  /** Chi phí thanh toán khác. */
  otherCosts: AdvanceLine[];
  /** Số tiền đề nghị tạm ứng (VND). */
  advanceRequested: number;
  /** Quyết toán CP tạm ứng — các khoản chi thực tế (đa ngoại tệ / đa phương thức). */
  settlements?: AdvanceSettlePay[];
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
  /** Hồ sơ tour mà báo giá thuộc về (1 hồ sơ : N báo giá). */
  tourProfileId?: string;
  tourCode?: string;
  customerId?: string;
  customerName?: string;
  /** Điểm đến của tour (info.dest) — index cho lịch sử báo giá. */
  dest?: string;
  status?: QuoteStatus;
  /** Vai trò giá trị trong hồ sơ tour (hiện tại/hợp đồng/nghiệm thu) — index cho 3 mốc giá trị. */
  valueRole?: QuoteValueRole;
  /** Lợi nhuận (VND) tại thời điểm lưu = computeTotals.totalProfit — index cho biên 3 mốc & phân tích. */
  profit?: number;
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
  /** Chỉ mục biên lợi THẬT (quyết toán) — cho ExecBoard & bảng điều hành. */
  settlementSummary?: {
    budgetCost: number;
    actualCost: number;
    actualProfit: number;
    actualMarginPct: number;
    plannedMarginPct: number;
    locked?: boolean;
  };
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
  /** @deprecated Dùng `excelFiles`. File Excel báo giá đơn (dữ liệu cũ). */
  excelFile?: FileAttachment;
  /** Lịch sử file Excel báo giá đã upload — cột "Báo giá Excel". */
  excelFiles?: FileAttachment[];
  /** Chia sẻ công khai cho khách (link): token + thời điểm xuất bản. */
  share?: { token: string; publishedAt: string };
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
