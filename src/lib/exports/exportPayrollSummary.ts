/**
 * #9 Xuất BẢNG TỔNG HỢP CÔNG một kỳ cho kế toán/tính lương (.xlsx): mỗi NV một dòng
 * với số công, phép, không lương, ốm, lễ + trạng thái/xác nhận. ExcelJS, brand teal.
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { BRAND_TEAL_ARGB } from './brand';
import { DEPT_LABEL } from '@/auth/departments';
import { ATTENDANCE_STATUS_LABEL, ATTENDANCE_CONFIRM_LABEL, type HrAttendance, type HrEmployee } from '@/types';

const FONT = 'Aptos';
const WHITE = 'FFFFFFFF', NAVY = 'FF0F3A4A', LINE = 'FFE4E8EB';

export async function exportPayrollSummary({
  period, employees, attendances,
}: {
  period: string;
  employees: HrEmployee[];
  attendances: HrAttendance[];
}): Promise<void> {
  const rowByEmp = new Map<string, HrAttendance>();
  for (const a of attendances) if (a.period === period) rowByEmp.set(a.employeeLegacyId, a);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Viettours Tour Cost Calculator';
  wb.created = new Date();
  const ws = wb.addWorksheet(`Tổng hợp công ${period}`, { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] });

  const headers = ['STT', 'MÃ NV', 'HỌ TÊN', 'PHÒNG BAN', 'SỐ NGÀY HC', 'NGHỈ PHÉP', 'KHÔNG LƯƠNG', 'ỐM/THAI SẢN', 'LỄ', 'TRẠNG THÁI', 'XÁC NHẬN'];
  const head = ws.addRow(headers);
  head.height = 22;
  head.eachCell((c, col) => {
    c.font = { name: FONT, bold: true, size: 11, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_TEAL_ARGB } };
    c.alignment = { vertical: 'middle', horizontal: col <= 4 ? 'left' : 'center', wrapText: true };
  });

  employees.forEach((e, i) => {
    const a = rowByEmp.get(e.id);
    const s = a?.summary;
    const dept = e.department ? (DEPT_LABEL[e.department as keyof typeof DEPT_LABEL] ?? e.department) : '';
    const row = ws.addRow([
      i + 1, e.employeeCode, e.fullName, dept,
      s?.totalHC ?? 0, s?.paidLeave ?? 0, s?.unpaidLeave ?? 0, s?.sick ?? 0, s?.holiday ?? 0,
      a ? ATTENDANCE_STATUS_LABEL[a.status] : 'Chưa có',
      a ? ATTENDANCE_CONFIRM_LABEL[a.confirmation.status] : '',
    ]);
    row.height = 16;
    row.eachCell((c, col) => {
      c.font = { name: FONT, size: 10, color: { argb: NAVY } };
      c.alignment = { vertical: 'middle', horizontal: col <= 4 ? 'left' : 'center' };
      c.border = { bottom: { style: 'thin', color: { argb: LINE } } };
    });
  });

  const widths = [6, 10, 26, 20, 12, 11, 13, 13, 8, 13, 14];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Tong-hop-cong-${period}-Viettours.xlsx`,
  );
}
