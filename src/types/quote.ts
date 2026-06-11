export type CategoryId =
  | 'flight' | 'hotel' | 'transport' | 'meal' | 'sight' | 'meeting'
  | 'teambuild' | 'gala' | 'logistics' | 'staff' | 'insurance'
  | 'visa' | 'dmc' | 'service_fee' | 'event' | 'other';

export type Template = 'domestic' | 'intl' | 'dmc' | 'itinerary' | 'menu' | 'visa' | 'doctranslate';

export type OutputCurrency =
  | 'VND' | 'USD' | 'EUR' | 'JPY' | 'SGD' | 'KRW' | 'THB' | 'GBP' | 'AUD' | 'CNY';

export type DmcMargin = {
  type: 'percent' | 'fixed';   // percent of totalCostVND, or fixed in outputCurrency
  value: number;
};

export type DmcPrices = Record<number, number>;  // keys at runtime: 20, 25, 30, 35, 40

export type QtyMode = 'per_pax' | 'per_group' | 'custom' | 'single_room' | 'double_room' | 'package';

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

export type QuoteDraft = {
  template: Template | null;
  info: QuoteInfo;
  pax: number;
  rates: Record<string, number>;
  margin: number;
  vat: number;
  svcBasis: number;
  rounding: number;
  items: Partial<Record<CategoryId, Item[]>>;
  catEnabled: Record<CategoryId, boolean>;
  currentQuoteId: string | null;
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
};

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
  createdByUsername: string;
  createdByName: string;
  collaborators: Collaborator[];
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  /** @deprecated Dùng `attachments`. File đính kèm đơn (dữ liệu cũ). */
  attachment?: { key: string; name: string };
  /** Nhiều file đính kèm cho báo giá (lưu trên R2 qua AI Worker). */
  attachments?: { key: string; name: string }[];
};

export type CloudQuoteProject = {
  versions: QuoteVersion[];
  currentState: QuoteDraft;
  collaborators: Collaborator[];
  updatedAt: string;
  updatedBy: string;
};
