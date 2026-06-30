/**
 * Xuất bảng chấm công một kỳ (tháng) ra Excel (.xlsx) dạng ma trận NV × ngày, ô tô màu
 * theo mã công + cột tổng "SỐ NGÀY HC". ExcelJS, header brand teal. Nạp động khi bấm.
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { BRAND_TEAL_ARGB } from './brand';
import { periodDays, weekdayLabelVN, isWeekend } from '@/lib/attendance/attendanceCalc';
import { lookupCode } from '@/lib/attendance/attendanceCodes';
import {
  ATTENDANCE_STATUS_LABEL, ATTENDANCE_CONFIRM_LABEL,
  type HrAttendance, type HrEmployee,
} from '@/types';

const FONT = 'Aptos';
const WHITE = 'FFFFFFFF', NAVY = 'FF0F3A4A', LINE = 'FFE4E8EB', WEEKEND = 'FFF2F2F2';

/** '#0d7a6a' → 'FF0D7A6A' cho ExcelJS. */
const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase().padStart(6, '0');

export async function exportAttendanceExcel({
  period, employees, attendances,
}: {
  period: string;
  employees: HrEmployee[];
  attendances: HrAttendance[];
}): Promise<void> {
  const days = periodDays(period);
  const rowByEmp = new Map<string, HrAttendance>();
  for (const a of attendances) if (a.period === period) rowByEmp.set(a.employeeLegacyId, a);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Viettours Tour Cost Calculator';
  wb.created = new Date();
  const ws = wb.addWorksheet(`Chấm công ${period}`, { views: [{ showGridLines: false, state: 'frozen', xSplit: 2, ySplit: 2 }] });

  // Hàng tiêu đề 1: tên cột + số ngày.
  const head1 = ['MÃ NV', 'HỌ TÊN', ...days.map((d) => Number(d.slice(8))), 'SỐ NGÀY HC', 'TRẠNG THÁI', 'XÁC NHẬN'];
  // Hàng tiêu đề 2: thứ trong tuần dưới mỗi ngày.
  const head2 = ['', '', ...days.map((d) => weekdayLabelVN(d)), '', '', ''];

  const r1 = ws.addRow(head1);
  const r2 = ws.addRow(head2);
  [r1, r2].forEach((r) => {
    r.height = 18;
    r.eachCell((c, col) => {
      c.font = { name: FONT, bold: true, size: r === r1 ? 11 : 8, color: { argb: WHITE } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_TEAL_ARGB } };
      c.alignment = { vertical: 'middle', horizontal: col <= 2 ? 'left' : 'center' };
    });
  });

  // Mỗi nhân viên 1 hàng.
  employees.forEach((e) => {
    const a = rowByEmp.get(e.id);
    const cells: (string | number)[] = [e.employeeCode, e.fullName];
    for (const iso of days) cells.push(a?.days[iso]?.code ?? '');
    cells.push(a?.summary.totalHC ?? 0);
    cells.push(a ? ATTENDANCE_STATUS_LABEL[a.status] : '');
    cells.push(a ? ATTENDANCE_CONFIRM_LABEL[a.confirmation.status] : '');
    const row = ws.addRow(cells);
    row.height = 16;
    row.eachCell((c, col) => {
      c.font = { name: FONT, size: 10, color: { argb: NAVY } };
      c.alignment = { vertical: 'middle', horizontal: col <= 2 ? 'left' : 'center', wrapText: false };
      c.border = { bottom: { style: 'thin', color: { argb: LINE } } };
      // Ô ngày: tô màu theo mã công.
      const dayIdx = col - 3;
      if (dayIdx >= 0 && dayIdx < days.length) {
        const iso = days[dayIdx];
        const cell = a?.days[iso];
        const def = cell ? lookupCode(cell.code) : undefined;
        if (cell) {
          const bg = def?.color ? argb(def.color) : 'FFFFE0B2';
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          c.font = { name: FONT, size: 9, bold: true, color: { argb: def && def.category !== 'other' ? WHITE : NAVY } };
        } else if (isWeekend(iso)) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WEEKEND } };
        }
      }
    });
  });

  // Bề rộng cột.
  ws.getColumn(1).width = 9;
  ws.getColumn(2).width = 26;
  for (let i = 0; i < days.length; i++) ws.getColumn(3 + i).width = 4.2;
  ws.getColumn(3 + days.length).width = 12;
  ws.getColumn(4 + days.length).width = 12;
  ws.getColumn(5 + days.length).width = 12;

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Bang-cham-cong-${period}-Viettours.xlsx`,
  );
}
