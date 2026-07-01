/**
 * #5 Tự sinh khung tháng: điền sẵn mã đi làm cho ngày thường, đánh dấu ngày lễ dương
 * lịch VN, bỏ trống cuối tuần. HR chỉ cần sửa ngoại lệ. Thuần (pure).
 */
import type { AttendanceDays } from '@/types';
import { periodDays, isWeekend } from './attendanceCalc';

/**
 * Ngày lễ DƯƠNG LỊCH cố định VN. KHÔNG gồm lễ ÂM LỊCH (Tết Nguyên đán, Giỗ Tổ) —
 * những ngày đó lệch hằng năm, HR đánh dấu tay.
 */
export function vietnamSolarHolidays(year: string): string[] {
  return [
    `${year}-01-01`, // Tết Dương lịch
    `${year}-04-30`, // Giải phóng miền Nam
    `${year}-05-01`, // Quốc tế Lao động
    `${year}-09-02`, // Quốc khánh
  ];
}

export type ScaffoldOptions = {
  workCode?: string;      // mã ngày thường (mặc định 'X')
  holidayCode?: string;   // mã ngày lễ (mặc định 'Lễ')
  includeWeekend?: boolean; // có điền cuối tuần không (mặc định không)
};

/** Sinh khung mã công cho cả tháng. Cuối tuần bỏ trống (trừ khi includeWeekend). */
export function scaffoldMonth(period: string, opts: ScaffoldOptions = {}): AttendanceDays {
  const workCode = opts.workCode ?? 'X';
  const holidayCode = opts.holidayCode ?? 'Lễ';
  const holidays = new Set(vietnamSolarHolidays(period.slice(0, 4)));
  const out: AttendanceDays = {};
  for (const iso of periodDays(period)) {
    if (holidays.has(iso)) out[iso] = { code: holidayCode };
    else if (isWeekend(iso)) { if (opts.includeWeekend) out[iso] = { code: workCode }; }
    else out[iso] = { code: workCode };
  }
  return out;
}
