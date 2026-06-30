import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseAttendanceExcel } from './importAttendanceExcel';
import type { HrEmployee } from '@/types';

/** File-like tối thiểu cho môi trường test (jsdom File chưa có arrayBuffer). */
const fileLike = (buf: ArrayBuffer): File =>
  ({ name: 'cham-cong.xlsx', arrayBuffer: async () => buf }) as unknown as File;

/** Dựng một workbook .xlsx mô phỏng bố cục bảng chấm công Viettours → File. */
async function buildFile(): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('THANG 6.26');
  // Hàng 10: tiêu đề (C=MÃ NV, D=HỌ TÊN), E10 tiêu đề ngày.
  ws.getCell('C10').value = 'MÃ NV';
  ws.getCell('D10').value = 'HỌ TÊN';
  // Hàng 11: 3 ngày + 1 cột tổng (tháng khác để chắc chắn bị loại).
  ws.getCell('E11').value = new Date(2026, 5, 1); // 2026-06-01
  ws.getCell('F11').value = new Date(2026, 5, 2);
  ws.getCell('G11').value = new Date(2026, 5, 3);
  ws.getCell('H11').value = new Date(2026, 5, 4);
  ws.getCell('I11').value = new Date(2026, 5, 5);
  // Hàng 12: thứ (không bắt buộc).
  ws.getCell('E12').value = 'T2';
  // Dữ liệu.
  ws.getCell('C13').value = '00601'; ws.getCell('D13').value = 'LƯU ĐÌNH PHỤC';
  ws.getCell('E13').value = 'X'; ws.getCell('F13').value = 'X'; ws.getCell('G13').value = 'P';
  ws.getCell('H13').value = 'X'; ws.getCell('I13').value = 'NB';
  ws.getCell('C14').value = '00055'; ws.getCell('D14').value = 'Hoàng Anh Tuấn';
  ws.getCell('E14').value = 'X'; ws.getCell('F14').value = 'CP';
  // Dòng không khớp nhân viên.
  ws.getCell('C15').value = '99999'; ws.getCell('D15').value = 'Người Lạ';
  ws.getCell('E15').value = 'X';

  const buf = await wb.xlsx.writeBuffer();
  return fileLike(buf as ArrayBuffer);
}

const emp = (id: string, employeeCode: string, fullName: string): HrEmployee => ({
  id, employeeCode, fullName, email: '', phone: '', department: 'dh_noidia', title: '', level: '',
  status: 'official', notes: '', documents: [], createdAt: '', createdBy: '',
});

describe('parseAttendanceExcel', () => {
  it('đọc bố cục ma trận, suy period & khớp nhân viên theo mã/tên', async () => {
    const file = await buildFile();
    const employees = [
      emp('e1', '00601', 'Lưu Đình Phục'),
      emp('e2', '55', 'Hoàng Anh Tuấn'), // mã thiếu số 0 đầu → vẫn khớp 00055
    ];
    const res = await parseAttendanceExcel(file, employees);

    expect(res.period).toBe('2026-06');
    expect(res.dateColumns).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']);
    expect(res.rows).toHaveLength(3);

    const p = res.rows.find((r) => r.employeeCode === '00601')!;
    expect(p.matchedEmployeeId).toBe('e1');
    expect(p.matchedBy).toBe('code');
    expect(p.days['2026-06-01'].code).toBe('X');
    expect(p.days['2026-06-03'].code).toBe('P');
    expect(p.days['2026-06-05'].code).toBe('NB');

    const t = res.rows.find((r) => r.employeeCode === '00055')!;
    expect(t.matchedEmployeeId).toBe('e2'); // khớp dù lệch số 0 đầu

    expect(res.matched).toBe(2);
    expect(res.unmatched).toBe(1);
    expect(res.warnings.join(' ')).toContain('KHÔNG khớp');
  });

  it('báo lỗi rõ khi thiếu cột MÃ NV', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('x');
    ws.getCell('A1').value = 'Linh tinh';
    const buf = await wb.xlsx.writeBuffer();
    await expect(parseAttendanceExcel(fileLike(buf as ArrayBuffer), [])).rejects.toThrow(/MÃ NV/);
  });
});
