import type { CloudQuoteEntry, Contract, ContractCancel, ContractPayment, Customer } from '@/types';
import { customerToPartyB } from '@/components/quote/contractFromDraft';

export const CONTRACT_STATUS = {
  draft:     { label: 'Nháp',            color: '#95a5a6', bg: 'rgba(149,165,166,0.12)', icon: '📝' },
  signed:    { label: 'Đã ký',           color: '#2980b9', bg: 'rgba(41,128,185,0.12)',  icon: '✍️' },
  active:    { label: 'Đang thực hiện',  color: '#f39c12', bg: 'rgba(243,156,18,0.12)',  icon: '🔄' },
  completed: { label: 'Hoàn thành',      color: '#27ae60', bg: 'rgba(39,174,96,0.12)',   icon: '✅' },
  cancelled: { label: 'Đã huỷ',          color: '#e74c3c', bg: 'rgba(231,76,60,0.12)',   icon: '❌' },
} as const;

export type ContractStatusKey = keyof typeof CONTRACT_STATUS;

export const DEFAULT_INCLUDES: string[] = [
  'Vé máy bay khứ hồi hạng phổ thông theo hành trình, bao gồm hành lý ký gửi.',
  'Thuế sân bay Việt Nam & Thuế sân bay nước ngoài và lệ phí an ninh hàng không. Chi phí này có thể thay đổi tại thời điểm xuất vé và sẽ được điều chỉnh cho phù hợp.',
  'Khách sạn tiêu chuẩn 4* hoặc tương đương: 2 khách 1 phòng, nếu lẻ phòng sắp xếp phòng 3 (giường phụ).',
  'Xe di chuyển và vé tham quan các nơi theo chương trình.',
  'Hướng dẫn viên địa phương theo chương trình.',
  'Tiền bồi dưỡng cho tài xế và hướng dẫn viên địa phương.',
  'Bảo hiểm du lịch với mức bồi thường tối đa 50.000 USD/trường hợp.',
  'Visa nhập cảnh (nếu có trong chương trình).',
];

export const DEFAULT_EXCLUDES: string[] = [
  'Chi phí làm hộ chiếu, lưu ý hộ chiếu phải còn hạn trên 6 tháng sau ngày khởi hành.',
  'Chi phí visa nhập cảnh Việt Nam dành cho khách Quốc tịch nước ngoài.',
  'Hướng dẫn viên khởi hành từ Việt Nam.',
  'Bữa ăn ngoài chương trình.',
  'Tiền điện thoại, Internet, Mini bar, Giặt ủi.',
  'Xe vận chuyển ngoài chương trình.',
  'Hành lý quá cước quy định và các chi phí cá nhân khác.',
  'Phụ thu phòng đơn.',
];

export const DEFAULT_PAYMENTS: ContractPayment[] = [
  {
    id: 'dp1', label: 'Đợt 1 – Cọc giữ chỗ', percent: 50, amount: 0,
    note: 'Trong vòng 07 ngày sau khi ký hợp đồng và nhận hoá đơn VAT từ Bên A',
    status: 'pending', dueDate: '',
  },
  {
    id: 'dp2', label: 'Đợt 2 – Trước khởi hành', percent: 50, amount: 0,
    note: 'Chậm nhất 03 ngày trước ngày khởi hành', status: 'pending', dueDate: '',
  },
];

export const DEFAULT_CANCELS: ContractCancel[] = [
  { when: 'Sau khi ký hợp đồng', penalty: 30 },
  { when: 'Trong vòng 15 ngày trước khởi hành', penalty: 50 },
  { when: 'Trong vòng 07 ngày làm việc trước khởi hành', penalty: 100 },
];

/** Format today as "DD/MM/YYYY" for contractDate default. */
export function todayDMY(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Build an initial contract from a picked CloudQuoteEntry. Thiết lập liên kết
 *  2 chiều báo giá ↔ hợp đồng; điền Bên B từ khách hàng nếu truyền vào. */
export function contractFromQuote(quote: CloudQuoteEntry, createdBy: string, customer?: Customer | null): Contract {
  const base = emptyContract(createdBy);
  return {
    ...base,
    tourName: quote.name,
    tourDest: quote.dest ?? '',
    contractPax: quote.pax,
    pricePerPax: quote.pax > 0 ? Math.round(quote.totalCost / quote.pax / 1000) * 1000 : 0,
    payments: DEFAULT_PAYMENTS.map(p => ({
      ...p,
      amount: Math.round(((quote.totalCost * p.percent!) / 100)),
    })),
    ...(customer ? { partyB: customerToPartyB(customer) } : {}),
    // ── Sợi dây CRM: liên kết 2 chiều ──
    linkedQuoteId: quote.cloudId,
    linkedQuoteName: quote.name,
  };
}

/** Build an empty contract shell for "Thêm trống". */
export function emptyContract(createdBy: string): Contract {
  return {
    id: '',
    contractNo: '',
    contractDate: todayDMY(),
    contractStatus: 'draft',
    tourName: '',
    tourDest: '',
    tourDays: 1,
    tourNights: 0,
    departure: 'TP. Hồ Chí Minh',
    contractPax: 20,
    pricePerPax: 0,
    partyB: { name: '', address: '', tel: '', rep: '', title: 'Giám đốc', taxCode: '', email: '' },
    includes: [...DEFAULT_INCLUDES],
    excludes: [...DEFAULT_EXCLUDES],
    payments: DEFAULT_PAYMENTS.map(p => ({ ...p })),
    cancels: DEFAULT_CANCELS.map(c => ({ ...c })),
    bondPercent: 8,
    hasAcceptance: false,
    createdAt: new Date().toISOString(),
    createdBy,
  };
}
