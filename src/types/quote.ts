export type CategoryId =
  | 'flight' | 'hotel' | 'transport' | 'meal' | 'sight' | 'meeting'
  | 'teambuild' | 'gala' | 'logistics' | 'staff' | 'insurance'
  | 'visa' | 'dmc' | 'service_fee';

export type Template = 'domestic' | 'intl' | 'dmc';

export type OutputCurrency =
  | 'VND' | 'USD' | 'EUR' | 'JPY' | 'SGD' | 'KRW' | 'THB' | 'GBP' | 'AUD' | 'CNY';

export type DmcMargin = {
  type: 'percent' | 'fixed';   // percent of totalCostVND, or fixed in outputCurrency
  value: number;
};

export type DmcPrices = Record<number, number>;  // keys at runtime: 20, 25, 30, 35, 40

export type QtyMode = 'per_pax' | 'per_group' | 'custom';

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
};

export type QuoteInfo = {
  name: string;
  dest: string;
  days: number;
  nights: number;
  startDate: string | null;
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
};

export type CloudQuoteProject = {
  versions: QuoteVersion[];
  currentState: QuoteDraft;
  collaborators: Collaborator[];
  updatedAt: string;
  updatedBy: string;
};
