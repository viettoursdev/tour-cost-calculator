import type {
  Activity, Day, ExecChecklistItem, ExecContact, ExecGuest, Segment,
} from '@/types';

let execSeq = 0;
const execId = (p: string) => p + Date.now().toString(36) + (execSeq++).toString(36) + Math.random().toString(36).slice(2, 4);

export function newExecContact(role = ''): ExecContact {
  return { id: execId('ec'), role, name: '', phone: '', note: '' };
}
export function newExecGuest(): ExecGuest {
  return { id: execId('eg'), name: '', room: '', dietary: '', medical: '', vip: false, note: '' };
}
export function newExecChecklistItem(text = ''): ExecChecklistItem {
  return { id: execId('cl'), text, done: false };
}

// Source: public/legacy.html:6618.
export function newActivity(): Activity {
  return {
    id: 'a' + Date.now() + Math.random().toString(36).slice(2, 5),
    time: '',
    text: '',
  };
}

// Source: public/legacy.html:6619.
export function newSegment(label = ''): Segment {
  return {
    id: 's' + Date.now() + Math.random().toString(36).slice(2, 5),
    groupLabel: label,
    transport: '',
    activities: [newActivity()],
  };
}

// Source: public/legacy.html:6620.
export function newDay(n: number): Day {
  return {
    id: 'd' + Date.now() + Math.random().toString(36).slice(2, 5),
    dayNum: n,
    date: '',
    title: '',
    meals: { B: false, L: false, D: false },
    mealNote: '',
    segments: [newSegment()],
  };
}

/** Nhân bản 1 ngày (deep copy, cấp id mới cho ngày/chặng/hoạt động). */
export function cloneDay(d: Day): Day {
  return {
    ...d,
    id: execId('d'),
    segments: d.segments.map((s) => ({
      ...s,
      id: execId('s'),
      activities: s.activities.map((a) => ({ ...a, id: execId('a') })),
    })),
  };
}

// Source: public/legacy.html:5605-5614.
export const ITIN_DEFAULT_INC: readonly string[] = [
  'Vé máy bay khứ hồi hạng phổ thông theo hành trình, bao gồm hành lý ký gửi.',
  'Thuế sân bay Việt Nam & Thuế sân bay nước ngoài và lệ phí an ninh hàng không. Chi phí này có thể thay đổi tại thời điểm xuất vé và sẽ được điều chỉnh cho phù hợp.',
  'Khách sạn tiêu chuẩn 4* hoặc tương đương: 2 khách 1 phòng, nếu lẻ phòng sắp xếp phòng 3 (giường phụ).',
  'Xe di chuyển và vé tham quan các nơi theo chương trình.',
  'Hướng dẫn viên địa phương theo chương trình.',
  'Tiền bồi dưỡng cho tài xế và hướng dẫn viên địa phương.',
  'Bảo hiểm du lịch với mức bồi thường tối đa 50.000 USD/trường hợp.',
  'Visa nhập cảnh (nếu có trong chương trình).',
];

// Source: public/legacy.html:5615-5624.
export const ITIN_DEFAULT_EXC: readonly string[] = [
  'Chi phí làm hộ chiếu, lưu ý hộ chiếu phải còn hạn trên 6 tháng sau ngày khởi hành.',
  'Chi phí visa nhập cảnh Việt Nam dành cho khách Quốc tịch nước ngoài.',
  'Hướng dẫn viên khởi hành từ Việt Nam.',
  'Bữa ăn ngoài chương trình.',
  'Tiền điện thoại, Internet, Mini bar, Giặt ủi.',
  'Xe vận chuyển ngoài chương trình.',
  'Hành lý quá cước quy định và các chi phí cá nhân khác.',
  'Phụ thu phòng đơn.',
];

// Source: public/legacy.html:6658-6665.
export const TRANSPORT_PRESETS = [
  { icon: '🚗', label: 'Xe ô tô', tpl: '🚗 Xe ô tô · ~__ km · ~__ phút di chuyển' },
  { icon: '✈️', label: 'Máy bay', tpl: '✈ Chuyến bay __ · __ → __ · ~__h bay' },
  { icon: '🚄', label: 'Tàu hỏa', tpl: '🚄 Tàu hỏa · ~__ km · ~__h' },
  { icon: '🚌', label: 'Xe khách', tpl: '🚌 Xe khách · ~__ km · ~__h' },
  { icon: '🛥️', label: 'Tàu thủy', tpl: '🛥 Tàu thủy · ~__ phút' },
  { icon: '🚶', label: 'Đi bộ', tpl: '🚶 Đi bộ tham quan · ~__ phút' },
] as const;
