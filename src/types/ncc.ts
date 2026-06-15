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

export type Ncc = {
  id: string;
  name: string;
  sectors: string[];
  location: string;
  contacts: NccContact[];
  note: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};
