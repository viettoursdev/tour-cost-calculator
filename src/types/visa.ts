export interface VisaFee {
  id: string;
  name: string;
  amount: number;
  cur: string;
  perPax: boolean;
}

export type VisaMarkupType = 'percent' | 'fixed';

export interface VisaProduct {
  id: string;
  country: string;
  visaType: string;
  validity: string;
  location: string;
  fees: VisaFee[];
  markupType: VisaMarkupType;
  markupValue: number;
  markupCur: string;
  note: string;
  active: boolean;
}

export interface VisaProductsDoc {
  products: VisaProduct[];
  rates: Record<string, number>;
  updatedAt?: string;
  updatedBy?: string;
}

export type VisaProcKind = 'enterprise' | 'applicant' | 'content' | 'relative' | 'custom';

export interface VisaProcField {
  id: string;
  label: string;
}

export interface VisaProcRow {
  id: string;
  values: Record<string, string>;
}

export interface VisaProcSection {
  id: string;
  kind: VisaProcKind;
  title: string;
  repeatable: boolean;
  fieldDefs: VisaProcField[];
  rows: VisaProcRow[];
}

export interface VisaProcVersion {
  versionNo: number;
  savedAt: string;
  savedBy: string;
  sections: VisaProcSection[];
}

export interface VisaProcDoc {
  id: string;
  code: string;
  title: string;
  country: string;
  linkedQuoteId: string | null;
  linkedQuoteName: string;
  createdByUsername: string;
  createdByName: string;
  collaborators: string[];
  sections: VisaProcSection[];
  versions: VisaProcVersion[];
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface VisaProcIndexEntry {
  id: string;
  code: string;
  title: string;
  country: string;
  linkedQuoteName: string;
  collaborators: string[];
  createdByUsername: string;
  createdByName: string;
  createdAt?: string;
  updatedAt: string;
  updatedBy: string;
}
