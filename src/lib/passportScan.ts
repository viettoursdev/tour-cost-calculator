/**
 * AI đọc ảnh HỘ CHIẾU / VISA → trích xuất thông tin có cấu trúc.
 * Pipeline (như nameCard): ảnh → /ocr (text thô, dùng được cả vùng MRZ) →
 * /ai (Claude → JSON). Trả về các trường khớp `TravelerDoc`.
 */
import { callAIWorker } from './aiWorker';
import { fileToBase64 } from './nameCard';

export interface ScannedDoc {
  fullName?: string;
  gender?: 'M' | 'F' | '';
  dob?: string;
  nationality?: string;
  passportNo?: string;
  passportIssueDate?: string;
  passportExpiry?: string;
  passportIssuePlace?: string;
  visaType?: string;
  visaCountry?: string;
  visaNo?: string;
  visaIssueDate?: string;
  visaExpiry?: string;
  visaEntries?: string;
  visaStatus?: string;
}

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

/** Chuẩn hoá ngày về ISO yyyy-mm-dd (nhận yyyy-mm-dd, dd/mm/yyyy, dd MMM yyyy). Không chắc → ''. */
export function toISODate(s: string): string {
  const v = (s || '').trim();
  if (!v) return '';
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return v;
  m = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/); // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})\s*([A-Za-z]{3})\s*(\d{4})$/); // 15 NOV 2026
  if (m) { const mm = MONTHS[m[2].toUpperCase()]; if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`; }
  return '';
}

/** Lấy JSON đầu tiên trong câu trả lời và map sang các trường ScannedDoc đã chuẩn hoá. */
export function parseDocJson(s: string): ScannedDoc {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return {};
  let o: Record<string, unknown>;
  try { o = JSON.parse(m[0]) as Record<string, unknown>; } catch { return {}; }
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
  const g = str('gender').toUpperCase();
  return {
    fullName: str('fullName'),
    gender: g === 'M' || g === 'F' ? (g as 'M' | 'F') : '',
    dob: toISODate(str('dob')),
    nationality: str('nationality'),
    passportNo: str('passportNo').toUpperCase(),
    passportIssueDate: toISODate(str('passportIssueDate')),
    passportExpiry: toISODate(str('passportExpiry')),
    passportIssuePlace: str('passportIssuePlace'),
    visaType: str('visaType'),
    visaCountry: str('visaCountry'),
    visaNo: str('visaNo'),
    visaIssueDate: toISODate(str('visaIssueDate')),
    visaExpiry: toISODate(str('visaExpiry')),
    visaEntries: str('visaEntries'),
    visaStatus: str('visaStatus'),
  };
}

const buildPrompt = (raw: string) =>
  'Bạn trích xuất thông tin từ nội dung OCR của ảnh HỘ CHIẾU và/hoặc VISA. ' +
  'Ưu tiên đọc vùng MRZ (2-3 dòng ký tự < ở cuối hộ chiếu) nếu có vì chính xác hơn. ' +
  'Trả về DUY NHẤT một JSON hợp lệ (không giải thích, không markdown) với các khoá: ' +
  'fullName, gender, dob, nationality, passportNo, passportIssueDate, passportExpiry, passportIssuePlace, ' +
  'visaType, visaCountry, visaNo, visaIssueDate, visaExpiry, visaEntries, visaStatus. ' +
  'QUY TẮC: mọi ngày theo định dạng yyyy-mm-dd; gender chỉ "M" hoặc "F"; nationality để tên nước; ' +
  'visaCountry = nước cấp visa; visaEntries = số lần nhập cảnh ("1 lần"/"nhiều lần"). ' +
  'Khoá nào không có trong ảnh để chuỗi rỗng "". Tên người để IN HOA như trên giấy tờ.\n\n' +
  `Nội dung OCR:\n"""${raw}"""`;

/** Quét ảnh hộ chiếu/visa → trả về các trường best-effort cho TravelerDoc. */
export async function scanTravelerDoc(file: File): Promise<ScannedDoc> {
  const image = await fileToBase64(file);
  const ocr = await callAIWorker('/ocr', { image });
  const raw = (ocr.text ?? '').trim();
  if (!raw) throw new Error('Không đọc được chữ trên ảnh. Thử chụp rõ nét, đủ sáng hơn.');
  const ai = await callAIWorker('/ai', { prompt: buildPrompt(raw) });
  return parseDocJson(ai.text ?? '');
}
