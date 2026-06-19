/**
 * AI phân tích file/ảnh THỰC ĐƠN nhà hàng → thông tin nhà hàng + các set menu.
 * Tái dùng extractFileContent (đọc Excel/PDF/Word/CSV/ảnh) + /chat (Sonnet).
 */
import { callAIWorker, type ContentBlock } from '@/lib/aiWorker';
import { extractObject } from '@/lib/partyParse';
import { extractFileContent } from '@/lib/quoteFileParse';
import { parseAmountVN } from '@/lib/numParse';
import { newRestaurant, newRestMenu } from '@/components/menu/constants';
import type { Restaurant } from '@/types';

export type ParsedRestMenu = { name: string; dishes: string; price: number; cur: string; review: string };
export type ParsedRestaurant = {
  name: string; address: string; city: string; country: string; continent: string;
  contact: string; note: string; rating: number; menus: ParsedRestMenu[];
};

const str = (v: unknown): string => (v == null ? '' : String(v)).trim();
const num = (v: unknown): number => { const n = parseAmountVN(str(v)); return Number.isFinite(n) ? n : 0; };

function mediaTypeFromB64(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

/** Chuẩn hoá object AI → ParsedRestaurant. */
export function mapRestaurant(o: Record<string, unknown>): ParsedRestaurant {
  const rawMenus = Array.isArray(o.menus) ? o.menus : (Array.isArray(o.sets) ? o.sets : []);
  const menus: ParsedRestMenu[] = rawMenus.map((m) => {
    const mm = (m ?? {}) as Record<string, unknown>;
    const dishesRaw = mm.dishes ?? mm.items ?? mm.mon;
    const dishes = Array.isArray(dishesRaw) ? dishesRaw.map(str).filter(Boolean).join('\n') : str(dishesRaw);
    return {
      name: str(mm.name ?? mm.set ?? 'Set') || 'Set',
      dishes,
      price: num(mm.price ?? mm.amount ?? mm.gia),
      cur: (str(mm.cur ?? mm.currency) || 'VND').toUpperCase(),
      review: str(mm.review ?? mm.note ?? mm.ghichu),
    };
  }).filter((m) => m.dishes || m.price > 0 || m.name !== 'Set');
  const ratingN = num(o.rating);
  return {
    name: str(o.name ?? o.restaurant ?? o.ten),
    address: str(o.address ?? o.diachi),
    city: str(o.city ?? o.thanhpho),
    country: str(o.country ?? o.quocgia),
    continent: str(o.continent ?? o.chauluc),
    contact: str(o.contact ?? o.phone ?? o.tel ?? o.email),
    note: str(o.note ?? o.notes ?? o.specialty ?? o.dacsan ?? o.ghichu),
    rating: ratingN >= 1 && ratingN <= 5 ? Math.round(ratingN) : 0,
    menus,
  };
}

/** Ghép ParsedRestaurant vào 1 Restaurant mới (id mới cho nhà hàng & từng set). */
export function parsedToRestaurant(p: ParsedRestaurant): Restaurant {
  const base = newRestaurant();
  return {
    ...base,
    name: p.name, address: p.address, city: p.city, country: p.country, continent: p.continent,
    contact: p.contact, note: p.note, rating: p.rating,
    menus: p.menus.map((m) => ({ ...newRestMenu(m.name), name: m.name, dishes: m.dishes, price: m.price, cur: m.cur, review: m.review })),
  };
}

const SYSTEM = [
  'Bạn trích xuất thông tin NHÀ HÀNG và THỰC ĐƠN từ file/ảnh (menu, brochure, bảng giá set ăn).',
  'CHỈ trả về JSON object hợp lệ, tiếng Việt, KHÔNG kèm chữ nào khác, theo schema:',
  '{"name":"tên nhà hàng","address":"địa chỉ","city":"thành phố","country":"quốc gia","continent":"châu lục","contact":"sđt/email","note":"đặc sản/ghi chú","rating":điểm 1-5 nếu có,"menus":[{"name":"tên set/thực đơn","dishes":"các món, mỗi món 1 dòng","price":giá(số),"cur":"VND|USD","review":"ghi chú"}]}',
  'Bỏ trống "" (hoặc menus rỗng) nếu không suy được. KHÔNG bịa số.',
].join('\n');

export async function parseRestaurantAI(input: { text?: string; imageB64?: string }): Promise<ParsedRestaurant> {
  const content: ContentBlock[] = [];
  if (input.imageB64) content.push({ type: 'image', source: { type: 'base64', media_type: mediaTypeFromB64(input.imageB64), data: input.imageB64 } } as unknown as ContentBlock);
  content.push({ type: 'text', text: input.text?.trim() || 'Phân tích thực đơn nhà hàng trong ảnh.' });
  const res = await callAIWorker('/chat', { system: SYSTEM, messages: [{ role: 'user', content }] });
  if (res.error) throw new Error(res.error);
  const raw = (res.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  const obj = extractObject(raw);
  if (!obj) throw new Error('AI trả về dữ liệu không đọc được. Hãy thử lại hoặc dùng file rõ hơn.');
  return mapRestaurant(obj);
}

/** Tiện ích: đọc file → AI → Restaurant sẵn sàng thêm. */
export async function analyzeRestaurantFile(file: File, onProgress?: (m: string) => void): Promise<{ parsed: ParsedRestaurant; restaurant: Restaurant }> {
  const c = await extractFileContent(file, onProgress);
  const parsed = await parseRestaurantAI({ text: c.text, imageB64: c.imageB64 });
  return { parsed, restaurant: parsedToRestaurant(parsed) };
}
