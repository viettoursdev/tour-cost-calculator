/**
 * Chấm công theo GIỜ vào/ra (overlay tùy chọn trên nền mã ngày). Thuần (pure).
 */
import type { AttendanceDays, AttendanceSettings } from '@/types';

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  hourTracking: false,
  standardStart: '08:00',
  standardEnd: '17:00',
  breakMins: 60,
  graceMins: 10,
};

/** Gộp cài đặt với mặc định (bản lưu có thể thiếu trường). */
export function withDefaults(s?: Partial<AttendanceSettings> | null): AttendanceSettings {
  return { ...DEFAULT_ATTENDANCE_SETTINGS, ...(s ?? {}) };
}

/** "HH:mm" → số phút từ 0h. null nếu không hợp lệ. */
export function parseHM(v: string | undefined | null): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Số phút → "HH:mm". */
export function fmtHM(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Số giờ làm thực từ giờ vào/ra (trừ nghỉ trưa). 0 nếu thiếu/không hợp lệ. Làm tròn 0.25h. */
export function computeHours(inT: string | undefined, outT: string | undefined, breakMins = 60): number {
  const a = parseHM(inT), b = parseHM(outT);
  if (a == null || b == null || b <= a) return 0;
  const net = Math.max(0, b - a - breakMins);
  return Math.round((net / 60) * 4) / 4;
}

/** Có đi muộn không (giờ vào > chuẩn + dung sai). */
export function isLate(inT: string | undefined, standardStart: string, graceMins: number): boolean {
  const a = parseHM(inT), s = parseHM(standardStart);
  if (a == null || s == null) return false;
  return a > s + graceMins;
}

/** Tổng giờ làm trong kỳ (cộng field hours của các ô). */
export function sumPeriodHours(days: AttendanceDays): number {
  let h = 0;
  for (const cell of Object.values(days)) h += cell?.hours ?? 0;
  return Math.round(h * 4) / 4;
}

/** Số ngày đi muộn trong kỳ. */
export function countLateDays(days: AttendanceDays, settings: AttendanceSettings): number {
  let n = 0;
  for (const cell of Object.values(days)) if (isLate(cell?.in, settings.standardStart, settings.graceMins)) n++;
  return n;
}
