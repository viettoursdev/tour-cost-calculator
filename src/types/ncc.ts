import type { CategoryId, FileAttachment } from './quote';

export type NccContact = {
  name: string;
  phone: string;
  email: string;
  position: string;
};

/** Một dòng giá tham khảo của sản phẩm NCC. */
export type NccPrice = {
  id: string;
  label: string;    // mô tả mức giá (vd "Mùa cao điểm", "Đoàn 20+", "Phòng đôi")
  amount: number;
  cur: string;      // VND / USD / …
  unit: string;     // đơn vị (người, đêm, chuyến, set…)
  note?: string;
};

/** Sản phẩm/dịch vụ của một NCC — giá tham khảo + file báo giá đính kèm. */
export type NccProduct = {
  id: string;
  nccId: string | null;   // tham chiếu NCC master (null nếu nhập tay)
  nccName: string;        // denormalized để hiển thị/tìm
  category: CategoryId;   // hạng mục chi phí
  name: string;
  description?: string;
  prices: NccPrice[];
  files: FileAttachment[]; // file báo giá tham khảo (R2)
  note?: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type NccProductsDoc = { products: NccProduct[] };

/** Đánh giá dịch vụ NCC — có log người + thời điểm. */
export type NccRating = {
  id: string;
  by: string;       // username
  byName: string;   // tên người đánh giá
  at: string;       // ISO
  stars: number;    // 1..5
  comment: string;
};

export type Ncc = {
  id: string;
  name: string;
  sectors: string[];
  continent?: string;   // châu lục (lọc)
  country?: string;     // quốc gia (lọc)
  location: string;     // địa điểm/thành phố cụ thể
  contacts: NccContact[];
  note: string;
  /** Phân tích/đánh giá của AI (lưu để tham khảo, hiển thị dưới ghi chú). */
  aiAnalysis?: string;
  /** Lịch sử đánh giá dịch vụ. */
  ratings?: NccRating[];
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};
