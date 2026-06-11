/**
 * Name-card (business card) scanner.
 * Pipeline: image → /ocr (raw text) → /ai (Claude → structured JSON),
 * with a regex fallback for email/phone/taxCode straight off the OCR text.
 */
import { callAIWorker } from './aiWorker';

export interface NameCardFields {
  company?: string;
  name?: string;
  position?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxCode?: string;
  website?: string;
}

/** Read a File into a base64 string (raw — no data URL prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? '').split(',')[1] ?? '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Pull the first {...} block out of a possibly-chatty AI reply and pick known string keys. */
export function parseLooseJson(s: string): NameCardFields {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const pick = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
    return {
      company: pick('company'),
      name: pick('name'),
      position: pick('position'),
      phone: pick('phone'),
      email: pick('email'),
      address: pick('address'),
      taxCode: pick('taxCode'),
      website: pick('website'),
    };
  } catch {
    return {};
  }
}

/** Regex fallback straight off the OCR text — fills only email/phone/taxCode. */
export function regexFallback(raw: string): Pick<NameCardFields, 'email' | 'phone' | 'taxCode'> {
  const email = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0] ?? '';
  const phone =
    raw.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.replace(/\s{2,}/g, ' ').trim() ?? '';
  const taxCode =
    raw.match(/(?:MST|M[ãa]\s*s[ốo]\s*thu[ếe]|Tax(?:\s*code)?)\s*[:#]?\s*([0-9][0-9-]{8,13})/i)?.[1] ??
    '';
  return { email, phone, taxCode };
}

const buildPrompt = (raw: string) =>
  'Bạn trích xuất thông tin từ nội dung OCR của một danh thiếp (name card). ' +
  'Trả về DUY NHẤT một JSON hợp lệ (không giải thích, không markdown) với các khoá: ' +
  'company, name, position, phone, email, address, taxCode, website. ' +
  'Khoá nào không tìm thấy để chuỗi rỗng "". ' +
  'company = tên công ty/tổ chức; name = họ tên người; position = chức danh.\n\n' +
  `Nội dung:\n"""${raw}"""`;

/** Scan a name-card image and return the best-effort structured fields. */
export async function scanNameCard(file: File): Promise<NameCardFields> {
  const image = await fileToBase64(file);
  const ocr = await callAIWorker('/ocr', { image });
  const raw = (ocr.text ?? '').trim();
  if (!raw) throw new Error('Không đọc được chữ trên ảnh. Thử chụp rõ nét hơn.');

  let fields: NameCardFields = {};
  try {
    const ai = await callAIWorker('/ai', { prompt: buildPrompt(raw) });
    fields = parseLooseJson(ai.text ?? '');
  } catch {
    fields = {};
  }

  const fb = regexFallback(raw);
  return {
    ...fields,
    email: fields.email || fb.email,
    phone: fields.phone || fb.phone,
    taxCode: fields.taxCode || fb.taxCode,
  };
}
