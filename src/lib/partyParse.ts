/**
 * AI trích xuất thông tin NCC / Khách hàng từ văn bản dán (danh thiếp, hồ sơ
 * công ty, chữ ký email, đoạn giới thiệu…) hoặc ẢNH → JSON điền sẵn form.
 * Dùng /chat (Sonnet) như flightParse.
 */
import { callAIWorker, type ContentBlock } from '@/lib/aiWorker';

export type ParsedContact = { name?: string; phone?: string; email?: string; position?: string };
export type ParsedNcc = { name?: string; sectors?: string[]; location?: string; contacts?: ParsedContact[]; note?: string; analysis?: string };
export type ParsedCustomer = {
  name?: string; type?: 'company' | 'individual'; address?: string; taxCode?: string;
  contacts?: ParsedContact[]; note?: string; source?: string; tags?: string[]; analysis?: string;
};

function mediaTypeFromB64(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

/** Bóc object JSON đầu tiên từ output AI (gỡ rào ```), trả null nếu không có. */
export function extractObject(raw: string): Record<string, unknown> | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch { return null; }
}

const str = (v: unknown): string => (v == null ? '' : String(v)).trim();
const strArr = (v: unknown): string[] =>
  (Array.isArray(v) ? v : str(v) ? str(v).split(/[;,]/) : []).map(str).filter(Boolean);

function mapContacts(v: unknown): ParsedContact[] {
  if (!Array.isArray(v)) return [];
  return v.map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return { name: str(o.name), phone: str(o.phone ?? o.tel ?? o.mobile), email: str(o.email), position: str(o.position ?? o.title ?? o.role) };
  }).filter((c) => c.name || c.phone || c.email);
}

export function mapNcc(o: Record<string, unknown>): ParsedNcc {
  return {
    name: str(o.name ?? o.company ?? o.supplier),
    sectors: strArr(o.sectors ?? o.sector ?? o.services ?? o.fields),
    location: str(o.location ?? o.address ?? o.city),
    contacts: mapContacts(o.contacts),
    note: str(o.note ?? o.notes ?? o.description),
    analysis: str(o.analysis ?? o.summary ?? o.assessment),
  };
}

export function mapCustomer(o: Record<string, unknown>): ParsedCustomer {
  const t = str(o.type).toLowerCase();
  return {
    name: str(o.name ?? o.company ?? o.customer),
    type: t === 'individual' || t === 'cá nhân' || t === 'personal' ? 'individual' : t === 'company' || t === 'công ty' ? 'company' : undefined,
    address: str(o.address ?? o.location),
    taxCode: str(o.taxCode ?? o.tax ?? o.mst ?? o.taxId),
    contacts: mapContacts(o.contacts),
    note: str(o.note ?? o.notes ?? o.description),
    source: str(o.source),
    tags: strArr(o.tags),
    analysis: str(o.analysis ?? o.summary ?? o.assessment),
  };
}

async function callParty(system: string, input: { text?: string; imageB64?: string }): Promise<Record<string, unknown>> {
  const content: ContentBlock[] = [];
  if (input.imageB64) content.push({ type: 'image', source: { type: 'base64', media_type: mediaTypeFromB64(input.imageB64), data: input.imageB64 } } as unknown as ContentBlock);
  content.push({ type: 'text', text: input.text?.trim() || 'Trích xuất thông tin trong ảnh.' });
  const res = await callAIWorker('/chat', { system, messages: [{ role: 'user', content }] });
  if (res.error) throw new Error(res.error);
  const raw = (res.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  const obj = extractObject(raw);
  if (!obj) throw new Error('AI trả về dữ liệu không đọc được. Hãy thử lại hoặc nhập tay.');
  return obj;
}

const NCC_PROMPT = [
  'Bạn trích xuất thông tin NHÀ CUNG CẤP du lịch (khách sạn, vận chuyển, nhà hàng, DMC, event…) từ văn bản/ảnh.',
  'CHỈ trả về JSON object, tiếng Việt, KHÔNG kèm chữ nào khác, schema:',
  '{"name":"tên NCC","sectors":["lĩnh vực"],"location":"địa điểm/tỉnh","contacts":[{"name":"","phone":"","email":"","position":""}],"note":"ghi chú ngắn","analysis":"1-2 câu nhận định: loại hình NCC, lĩnh vực phù hợp, điểm đáng chú ý"}',
  'Bỏ trống ("") trường không suy được. Không bịa. "analysis" là nhận định ngắn dựa trên dữ liệu có.',
].join('\n');

const CUSTOMER_PROMPT = [
  'Bạn trích xuất thông tin KHÁCH HÀNG (công ty hoặc cá nhân) từ văn bản/ảnh (danh thiếp, hồ sơ, chữ ký email…).',
  'CHỈ trả về JSON object, tiếng Việt, KHÔNG kèm chữ nào khác, schema:',
  '{"name":"tên KH","type":"company|individual","address":"địa chỉ","taxCode":"MST","contacts":[{"name":"","phone":"","email":"","position":""}],"source":"nguồn","tags":["nhãn"],"note":"ghi chú","analysis":"1-2 câu nhận định: phân khúc, tiềm năng (vd MICE/B2B), gợi ý nhãn"}',
  'Bỏ trống ("") trường không suy được. Không bịa. "analysis" là nhận định ngắn dựa trên dữ liệu có; "tags" gợi ý nhãn phân loại.',
].join('\n');

export async function parseNccAI(input: { text?: string; imageB64?: string }): Promise<ParsedNcc> {
  return mapNcc(await callParty(NCC_PROMPT, input));
}
export async function parseCustomerAI(input: { text?: string; imageB64?: string }): Promise<ParsedCustomer> {
  return mapCustomer(await callParty(CUSTOMER_PROMPT, input));
}
