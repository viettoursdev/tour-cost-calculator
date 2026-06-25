/**
 * Quét hộ chiếu bằng AI (Claude vision qua worker /chat + EXTRACT_MARKER → bỏ qua
 * cổng chủ đề). Trả về phần thông tin khách để tự điền. parsePassportJson tách
 * riêng (thuần) để test.
 */
import { callAIWorker, markExtract } from '@/lib/aiWorker';
import type { Passenger } from '@/types';

const PROMPT = markExtract(
  'Bạn trích xuất thông tin từ ẢNH HỘ CHIẾU. Chỉ TRẢ VỀ một object JSON hợp lệ, KHÔNG '
  + 'kèm markdown/giải thích. Các khoá: fullName (họ tên IN HOA KHÔNG DẤU như in trên hộ '
  + 'chiếu), dob (YYYY-MM-DD), sex ("M" hoặc "F"), passportNo, issueDate (YYYY-MM-DD), '
  + 'expiryDate (YYYY-MM-DD), nationality. Khoá nào không đọc được thì để chuỗi rỗng "".',
);

export interface PassportFields {
  fullName: string; dob: string; sex: string; passportNo: string;
  issueDate: string; expiryDate: string; nationality: string;
}

/** Tách JSON từ phản hồi model (bỏ rào ```json, lấy đoạn { … } đầu tiên). */
export function parsePassportJson(text: string): PassportFields {
  const s = String(text || '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  let obj: Record<string, unknown> = {};
  if (a >= 0 && b > a) { try { obj = JSON.parse(s.slice(a, b + 1)); } catch { obj = {}; } }
  const str = (k: string) => (typeof obj[k] === 'string' ? (obj[k] as string).trim() : '');
  return {
    fullName: str('fullName'), dob: str('dob'),
    sex: str('sex').toUpperCase().startsWith('F') ? 'F' : str('sex').toUpperCase().startsWith('M') ? 'M' : '',
    passportNo: str('passportNo'), issueDate: str('issueDate'),
    expiryDate: str('expiryDate'), nationality: str('nationality'),
  };
}

/** Chuyển field hộ chiếu → patch cho 1 khách (Passenger). */
export function passportToPassenger(f: PassportFields): Partial<Passenger> {
  return {
    name: f.fullName, nameNoAccent: f.fullName,
    gender: f.sex === 'M' ? 'M' : f.sex === 'F' ? 'F' : '',
    dob: f.dob || undefined,
    idType: f.passportNo ? 'passport' : '',
    idNo: f.passportNo || undefined,
    passportIssue: f.issueDate || undefined,
    passportExpiry: f.expiryDate || undefined,
    nationality: f.nationality || undefined,
  };
}

const fileToBase64 = (file: File): Promise<{ data: string; mediaType: string }> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      const comma = s.indexOf(',');
      resolve({ data: comma >= 0 ? s.slice(comma + 1) : s, mediaType: file.type || 'image/jpeg' });
    };
    r.onerror = () => reject(new Error('Không đọc được file ảnh'));
    r.readAsDataURL(file);
  });

/** Gọi AI trích xuất hộ chiếu từ 1 ảnh → patch khách. */
export async function extractPassport(file: File): Promise<Partial<Passenger>> {
  const { data, mediaType } = await fileToBase64(file);
  const res = await callAIWorker('/chat', {
    system: PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
        { type: 'text', text: 'Trích xuất thông tin hộ chiếu theo schema JSON đã nêu.' },
      ],
    }],
  });
  const txt = (res.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
  return passportToPassenger(parsePassportJson(txt));
}
