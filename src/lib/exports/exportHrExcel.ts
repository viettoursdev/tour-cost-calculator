/**
 * Xuất dữ liệu Nhân sự ra Excel (.xlsx): 3 sheet Nhân sự / Pool HDV / Ứng viên.
 * ExcelJS, header brand teal Viettours. Nạp động khi bấm (tránh kéo lib nặng).
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { BRAND_TEAL_ARGB } from './brand';
import { DEPT_LABEL } from '@/auth/departments';
import {
  EMPLOYMENT_STATUS_LABEL, GUIDE_STATUS_LABEL, CANDIDATE_STAGE_LABEL,
  type HrEmployee, type HrGuide, type HrCandidate,
} from '@/types';

const FONT = 'Aptos';
const NAVY = 'FF0F3A4A', WHITE = 'FFFFFFFF', LINE = 'FFE4E8EB';

const deptLabel = (d: string) => (d ? (DEPT_LABEL[d as keyof typeof DEPT_LABEL] ?? d) : '');

function addSheet(wb: ExcelJS.Workbook, name: string, headers: string[], rows: (string | number)[][]) {
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] });
  ws.addRow(headers);
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((c) => {
    c.font = { name: FONT, bold: true, size: 11, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_TEAL_ARGB } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  rows.forEach((r) => {
    const row = ws.addRow(r);
    row.eachCell((c) => {
      c.font = { name: FONT, size: 10, color: { argb: NAVY } };
      c.alignment = { vertical: 'middle', wrapText: true };
      c.border = { bottom: { style: 'thin', color: { argb: LINE } } };
    });
  });
  headers.forEach((h, i) => {
    const maxLen = Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length));
    ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 2, 10), 42);
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
}

export async function exportHrExcel({
  employees, guides, candidates,
}: {
  employees: HrEmployee[];
  guides: HrGuide[];
  candidates: HrCandidate[];
}): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Viettours Tour Cost Calculator';
  wb.created = new Date();

  addSheet(wb, 'Nhân sự',
    ['Mã NV', 'Họ tên', 'Phòng ban', 'Chức danh', 'Cấp bậc', 'Trạng thái', 'Điện thoại', 'Email', 'Ngày vào', 'Số giấy tờ'],
    employees.map((e) => [
      e.employeeCode, e.fullName, deptLabel(e.department), e.title, e.level,
      EMPLOYMENT_STATUS_LABEL[e.status], e.phone, e.email, e.joinDate ?? '', e.documents.length,
    ]),
  );

  addSheet(wb, 'Pool HDV',
    ['Họ tên', 'Trạng thái', 'Điện thoại', 'Email', 'Số thẻ HDV', 'Thẻ hết hạn', 'Ngôn ngữ', 'Tuyến/vùng', 'Đánh giá', 'Thù lao/ngày'],
    guides.map((g) => [
      g.fullName, GUIDE_STATUS_LABEL[g.status], g.phone, g.email, g.guideCardNo, g.guideCardExpires ?? '',
      g.languages.join(', '), g.regions.join(', '), g.rating ?? '', g.dayRate ?? '',
    ]),
  );

  addSheet(wb, 'Ứng viên',
    ['Họ tên', 'Vị trí', 'Phòng ban', 'Giai đoạn', 'Nguồn', 'Điện thoại', 'Email', 'Ngày ứng tuyển', 'Đánh giá'],
    candidates.map((c) => [
      c.fullName, c.position, deptLabel(c.department), CANDIDATE_STAGE_LABEL[c.stage], c.source,
      c.phone, c.email, c.appliedDate ?? '', c.rating ?? '',
    ]),
  );

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Nhan-su-Viettours-${stamp}.xlsx`);
}
