import type { Department, ProcessTemplate, WorkflowStep } from '@/types';
import { parseDueRuleOffset } from '@/components/quote/workflowConstants';

// Bộ quy trình (SOP) DỰNG SẴN trong code cho 5 phòng ban. `isSeed = true` → chỉ
// đọc cho tới khi người dùng bấm "Dùng mẫu" để clone vào DB (process_templates).
// Nội dung bám nghiệp vụ thực tế ngành lữ hành: mỗi bước đủ Hành động (label) ·
// Người làm (ownerDept) · Đầu ra (output) · Hạn (dueRule) · Rủi ro (risk).

/** Màu nhấn + icon theo phòng ban (đồng bộ DEPARTMENTS). */
export const DEPT_COLOR: Record<Department, string> = {
  dh_noidia: '#0d7a6a',
  dh_nuocngoai: '#2563eb',
  hdv: '#f5a623',
  visa: '#7c3aed',
  ketoan: '#dc3250',
  muahang: '#0891b2',
  sukien: '#db2777',
};
export const DEPT_ICON: Record<Department, string> = {
  dh_noidia: '🏠', dh_nuocngoai: '🌏', ketoan: '🧮', visa: '🛂', hdv: '🧭',
  muahang: '🛒', sukien: '🎉',
};

type SeedStep = Pick<WorkflowStep, 'label' | 'output' | 'risk' | 'dueRule'>;

/** Dựng 1 template seed với id ổn định cho từng bước. */
function tpl(
  id: string, department: Department, name: string, description: string, steps: SeedStep[],
): ProcessTemplate {
  return {
    id,
    department,
    name,
    description,
    icon: DEPT_ICON[department],
    color: DEPT_COLOR[department],
    version: 1,
    isPublished: true,
    isSeed: true,
    steps: steps.map((s, i): WorkflowStep => ({
      id: `${id}::${i}`,
      label: s.label,
      status: 'todo',
      ownerDept: department,
      output: s.output,
      risk: s.risk,
      dueRule: s.dueRule,
      dueOffset: parseDueRuleOffset(s.dueRule),
    })),
  };
}

const DH_NOIDIA = tpl(
  'seed_dh_noidia_filetour', 'dh_noidia',
  'Vận hành file tour nội địa',
  'Từ lúc nhận booking tới khi quyết toán — 7 bước chuẩn cho đoàn nội địa.',
  [
    { label: 'Tiếp nhận & mở file tour', output: 'File tour mở trên hệ thống (đủ số khách, lịch, ngân sách, yêu cầu đặc biệt)', risk: 'Thiếu thông tin từ sales bàn giao', dueRule: 'Trong 24h nhận booking' },
    { label: 'Liên hệ NCC, lấy giá & xác nhận chỗ', output: 'Bảng giá land cập nhật + availability', risk: 'Đặt nhầm ngày / số phòng', dueRule: 'T-X trước khởi hành' },
    { label: 'Đặt dịch vụ, gửi đặt cọc', output: 'Confirmation các dịch vụ', risk: 'Thanh toán NCC trễ làm mất giữ chỗ', dueRule: 'Theo deadline NCC' },
    { label: 'Lập operation sheet & itinerary chi tiết', output: 'OP sheet hoàn chỉnh', risk: 'Sai thông tin trên itinerary gửi khách', dueRule: 'T-7' },
    { label: 'Briefing HDV, bàn giao hồ sơ đoàn', output: 'Biên bản bàn giao', risk: 'Không có phương án backup HDV / xe', dueRule: 'T-2' },
    { label: 'Trực tuyến trong tour, xử lý phát sinh', output: 'Log sự cố (nếu có)', risk: 'Quên xác nhận lại dịch vụ sát ngày', dueRule: 'Suốt tour' },
    { label: 'Quyết toán, đối chiếu công nợ NCC', output: 'Bảng quyết toán tour', risk: 'Bỏ sót chứng từ', dueRule: 'T+7 sau tour' },
  ],
);

const DH_NUOCNGOAI = tpl(
  'seed_dh_nuocngoai_filetour', 'dh_nuocngoai',
  'Vận hành file tour nước ngoài (outbound)',
  'Như nội địa + visa đoàn, vé quốc tế, đối tác land nước ngoài và chênh lệch tỷ giá.',
  [
    { label: 'Tiếp nhận & mở file tour outbound', output: 'File tour mở + danh sách dịch vụ cần đặt', risk: 'Thiếu thông tin hộ chiếu / yêu cầu visa', dueRule: 'Trong 24h nhận booking' },
    { label: 'Xác nhận visa & hồ sơ đoàn', output: 'Danh sách khách cần xử lý visa (chuyển bộ phận Visa)', risk: 'Không đủ thời gian xử lý visa trước khởi hành', dueRule: 'T-30' },
    { label: 'Đặt vé quốc tế & giữ chỗ dịch vụ', output: 'Confirmation vé + dịch vụ', risk: 'Sai tên hành khách trên vé; lịch nối chuyến lỗi', dueRule: 'Theo deadline hãng' },
    { label: 'Chốt giá & đặt cọc đối tác land nước ngoài', output: 'Hợp đồng / xác nhận đối tác land', risk: 'Rủi ro tỷ giá khi thanh toán ngoại tệ', dueRule: 'T-21' },
    { label: 'Lập OP sheet & itinerary chi tiết', output: 'OP sheet (có múi giờ, giờ bay)', risk: 'Sai múi giờ / lịch bay nối chuyến', dueRule: 'T-10' },
    { label: 'Briefing trưởng đoàn/HDV, gửi thông tin đoàn', output: 'Biên bản bàn giao + liên hệ khẩn ở nước ngoài', risk: 'Thiếu kênh liên hệ khẩn cấp', dueRule: 'T-3' },
    { label: 'Trực tuyến trong tour, xử lý phát sinh quốc tế', output: 'Log sự cố', risk: 'Chậm chuyến, lạc đoàn, khác biệt văn hoá', dueRule: 'Suốt tour' },
    { label: 'Quyết toán, đối chiếu công nợ & tỷ giá', output: 'Bảng quyết toán (quy đổi tỷ giá)', risk: 'Ghi nhận sai tỷ giá', dueRule: 'T+7 sau tour' },
  ],
);

const HDV = tpl(
  'seed_hdv_dandoan', 'hdv',
  'Dẫn đoàn (HDV)',
  'Quy trình của hướng dẫn viên từ nhận bàn giao tới quyết toán tạm ứng sau tour.',
  [
    { label: 'Nhận bàn giao đoàn từ điều hành', output: 'Hồ sơ đoàn đã nhận (lịch, danh sách, yêu cầu đặc biệt)', risk: 'Thiếu thông tin khách đặc biệt (ăn kiêng, sức khoẻ)', dueRule: 'T-2' },
    { label: 'Chuẩn bị tuyến & bài thuyết minh', output: 'Bài thuyết minh + checklist vật dụng đoàn', risk: 'Không nắm điểm dừng / đặc sản / quy định điểm đến', dueRule: 'T-1' },
    { label: 'Đón đoàn & điểm danh khởi hành', output: 'Xác nhận đủ khách, đúng giờ', risk: 'Thiếu khách, sai điểm/giờ đón', dueRule: 'Ngày khởi hành' },
    { label: 'Điều phối hiện trường theo lịch', output: 'Nhật ký hành trình', risk: 'Trễ giờ; đổi dịch vụ không báo điều hành', dueRule: 'Suốt tour' },
    { label: 'Xử lý sự cố (khách ốm, đổi dịch vụ)', output: 'Log sự cố + báo điều hành', risk: 'Tự ý quyết định ngoài thẩm quyền', dueRule: 'Khi phát sinh' },
    { label: 'Thu thập feedback khách cuối tour', output: 'Phiếu đánh giá khách', risk: 'Bỏ qua khiếu nại tại chỗ', dueRule: 'Ngày cuối tour' },
    { label: 'Báo cáo & quyết toán tạm ứng sau tour', output: 'Bảng quyết toán tạm ứng + chứng từ', risk: 'Tạm ứng tồn đọng không hoàn đúng hạn', dueRule: 'T+3 sau tour' },
  ],
);

const VISA = tpl(
  'seed_visa_hoso', 'visa',
  'Xử lý một hồ sơ visa',
  '7 bước chuẩn, có 2 lớp rà soát cho hồ sơ khó — rủi ro pháp lý cao.',
  [
    { label: 'Tiếp nhận yêu cầu, xác định quốc gia & loại visa', output: 'Phiếu thông tin khách', risk: 'Xác định sai loại visa / thị trường', dueRule: 'Trong ngày' },
    { label: 'Đánh giá khả năng đậu & lập checklist riêng', output: 'Bản đánh giá + checklist hồ sơ', risk: 'Đánh giá sai hồ sơ yếu → tư vấn nhầm', dueRule: '1-2 ngày' },
    { label: 'Hướng dẫn khách chuẩn bị giấy tờ', output: 'Bộ hồ sơ thô từ khách', risk: 'Thiếu giấy tờ bắt buộc', dueRule: 'Theo lịch nộp' },
    { label: 'Kiểm tra, dịch/công chứng, hoàn thiện form (2 lớp rà soát)', output: 'Hồ sơ hoàn chỉnh đã rà soát', risk: 'Thông tin form không khớp giấy tờ', dueRule: 'T-X trước hạn nộp' },
    { label: 'Đặt lịch hẹn & nộp hồ sơ', output: 'Biên nhận nộp hồ sơ', risk: 'Bỏ lỡ lịch hẹn / yêu cầu mới của lãnh sự', dueRule: 'Theo lịch lãnh sự' },
    { label: 'Theo dõi kết quả, thông báo khách', output: 'Kết quả visa', risk: 'Cập nhật trễ cho khách', dueRule: 'Đến khi có kết quả' },
    { label: 'Xử lý trường hợp bị từ chối', output: 'Phương án nộp lại / khiếu nại', risk: 'Không phân tích kỹ lý do rớt', dueRule: 'Trong 2 ngày' },
  ],
);

const KETOAN = tpl(
  'seed_ketoan_quyettoan', 'ketoan',
  'Quyết toán một file tour',
  'Tập hợp chi phí, đối chiếu công nợ và tính lãi/lỗ từng tour — mốc T+3 → T+10.',
  [
    { label: 'Nhận hồ sơ quyết toán từ điều hành', output: 'Bộ chứng từ đủ + bảng kê chi', risk: 'Chứng từ thiếu / không hợp lệ', dueRule: 'T+3 sau tour' },
    { label: 'Đối chiếu chi phí thực tế vs dự toán', output: 'Bảng so sánh chi phí', risk: 'Bỏ sót khoản phát sinh', dueRule: 'T+5' },
    { label: 'Đối chiếu công nợ với từng NCC', output: 'Biên bản đối chiếu', risk: 'Đối chiếu sai → trả thừa / thiếu', dueRule: 'T+7' },
    { label: 'Tính doanh thu, giá vốn, lợi nhuận file tour', output: 'Bảng P&L tour', risk: 'Ghi nhận doanh thu sai kỳ', dueRule: 'T+7' },
    { label: 'Hoàn ứng / thu hồi tạm ứng điều hành', output: 'Phiếu hoàn ứng', risk: 'Tạm ứng tồn đọng không hoàn', dueRule: 'T+7' },
    { label: 'Ghi sổ, lưu hồ sơ', output: 'Bút toán hoàn tất', risk: 'Quên thu công nợ đại lý', dueRule: 'T+10' },
  ],
);

/** Toàn bộ template dựng sẵn (theo thứ tự phòng ban hiển thị). */
export const PROCESS_SEED: ProcessTemplate[] = [
  DH_NOIDIA, DH_NUOCNGOAI, HDV, VISA, KETOAN,
];

/** Lọc template seed theo phòng ban. */
export const seedTemplatesFor = (dept: Department): ProcessTemplate[] =>
  PROCESS_SEED.filter((t) => t.department === dept);
