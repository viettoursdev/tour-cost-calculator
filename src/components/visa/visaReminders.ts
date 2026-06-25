/**
 * Mẫu tin nhắn nhắc khách (hàm THUẦN, dễ test). Sinh nội dung tiếng Việt nhắc khách
 * nộp hồ sơ / đi sinh trắc học · phỏng vấn / thông báo kết quả — điền sẵn tên đoàn,
 * nước, ngày deadline và danh sách khách liên quan.
 */
import type { Passenger, VisaProjectDoc } from '@/types';
import { deriveVisaStatus } from './constants';

export type ReminderKind = 'docs' | 'biometrics' | 'result';

export const REMINDER_META: Record<ReminderKind, { label: string; icon: string }> = {
  docs: { label: 'Nhắc nộp / bổ sung hồ sơ', icon: '📄' },
  biometrics: { label: 'Nhắc đi sinh trắc học / phỏng vấn', icon: '🧬' },
  result: { label: 'Thông báo kết quả visa', icon: '📣' },
};

const fmt = (d?: string | null): string => {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return d; }
};
const msDate = (p: Passenger, key: string): string =>
  (p.visaTimeline ?? []).find((m) => m.key === key)?.date ?? '';

/** Khách liên quan tới từng loại tin nhắn. */
export function relevantGuests(kind: ReminderKind, applicants: Passenger[]): Passenger[] {
  if (kind === 'docs') return applicants.filter((p) => ['deployed', 'collecting'].includes(deriveVisaStatus(p)));
  if (kind === 'biometrics') return applicants.filter((p) => ['collected', 'biometrics'].includes(deriveVisaStatus(p)) || !!msDate(p, 'biometrics'));
  return applicants.filter((p) => ['passed', 'failed', 'have_visa'].includes(deriveVisaStatus(p)));
}

/** Dòng mô tả từng khách trong tin. */
function guestLine(kind: ReminderKind, p: Passenger): string {
  const name = p.name || '(chưa có tên)';
  if (kind === 'docs') {
    const dl = fmt(msDate(p, 'doc_deadline'));
    return `• ${name}${dl ? ` — hạn nộp: ${dl}` : ''}`;
  }
  if (kind === 'biometrics') {
    const bd = fmt(msDate(p, 'biometrics'));
    return `• ${name}${bd ? ` — lịch SLTH/PV: ${bd}` : ''}`;
  }
  const st = deriveVisaStatus(p);
  const r = st === 'passed' ? '✅ ĐẬU visa' : st === 'have_visa' ? '✅ Đã có visa' : st === 'failed' ? `❌ RỚT visa${p.failReason ? ` (${p.failReason})` : ''}` : '—';
  return `• ${name}: ${r}`;
}

export interface ReminderText { text: string; count: number; }

/** Soạn nguyên khối tin nhắn (header + lời nhắn + danh sách khách) để copy/gửi. */
export function buildReminder(kind: ReminderKind, project: VisaProjectDoc, applicants: Passenger[]): ReminderText {
  const guests = relevantGuests(kind, applicants);
  const tour = project.name || project.code || 'đoàn';
  const country = project.country ? ` đi ${project.country}` : '';
  const dep = project.departureDate ? fmt(project.departureDate) : '';

  let head = '';
  let body = '';
  if (kind === 'docs') {
    head = `📄 NHẮC HỒ SƠ VISA — ${tour}${country}`;
    body = `Kính gửi Quý khách,\nViettours xin nhắc Quý khách hoàn tất/bổ sung hồ sơ xin visa${country} theo đúng thời hạn để kịp tiến độ${dep ? ` (khởi hành ${dep})` : ''}. Vui lòng phản hồi sớm giúp chúng tôi. Trân trọng cảm ơn!`;
  } else if (kind === 'biometrics') {
    head = `🧬 LỊCH SINH TRẮC HỌC / PHỎNG VẤN — ${tour}${country}`;
    body = `Kính gửi Quý khách,\nViettours xin thông báo lịch lấy sinh trắc học / phỏng vấn xin visa${country}. Quý khách vui lòng có mặt đúng giờ và mang đầy đủ giấy tờ theo hướng dẫn. Trân trọng!`;
  } else {
    head = `📣 KẾT QUẢ VISA — ${tour}${country}`;
    body = `Kính gửi Quý khách,\nViettours xin thông báo kết quả xét visa${country} như sau:`;
  }

  const list = guests.length ? guests.map((p) => guestLine(kind, p)).join('\n') : '(chưa có khách phù hợp)';
  return { text: `${head}\n\n${body}\n\n${list}`, count: guests.length };
}
