/**
 * Dựng bản NHÁP từ đề xuất của Trợ lý ảo và mở trong trình soạn thảo tương ứng.
 * Lịch trình: lưu vào store + điều hướng (linkNav). Báo giá: nạp qua quoteStore.applyImport.
 */
import { useAuthStore } from '@/stores/authStore';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useNccStore } from '@/stores/nccStore';
import { useLinkNavStore } from '@/stores/linkNavStore';
import { getCATS } from '@/components/quote/constants';
import { hasPerm } from '@/auth/PERMISSIONS';
import { CATEGORY_ENUM } from './tools';
import type { CategoryId, Item, Itinerary, Ncc, QuoteDraft, Template } from '@/types';

const sText = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Lưu nhà cung cấp do Trợ lý đề xuất vào danh sách NCC (cần quyền manageNCC). */
export async function applySupplierDraft(payload: Record<string, unknown>): Promise<string> {
  const user = useAuthStore.getState().currentUser;
  if (!user || !hasPerm(user, 'manageNCC')) throw new Error('Bạn không có quyền thêm Nhà cung cấp.');
  const name = sText(payload.name);
  if (!name) throw new Error('Thiếu tên NCC.');
  const website = sText(payload.website);
  const note = [sText(payload.note), website ? `Website: ${website}` : '', '— Lưu từ Trợ lý (cần xác minh).']
    .filter(Boolean).join('\n');
  const ncc: Ncc = {
    id: '', name,
    sectors: Array.isArray(payload.sectors) ? (payload.sectors as unknown[]).map(sText).filter(Boolean) : [],
    location: sText(payload.location),
    contacts: [{ name: sText(payload.contactName), phone: sText(payload.phone), email: sText(payload.email), position: '' }],
    note, createdAt: '', createdBy: '',
  };
  await useNccStore.getState().save(ncc);
  return name;
}

let seq = 0;
const uid = (p: string) => p + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

type ItinDay = { day?: number; title?: string; meals?: { breakfast?: boolean; lunch?: boolean; dinner?: boolean }; activities?: string[] };

/** Dựng nháp lịch trình → lưu store → mở trình soạn thảo lịch trình. */
export async function applyItineraryDraft(payload: Record<string, unknown>): Promise<void> {
  const user = useAuthStore.getState().currentUser;
  const sched = (Array.isArray(payload.schedule) ? payload.schedule : []) as ItinDay[];
  const days = typeof payload.days === 'number' ? payload.days : sched.length;
  const now = new Date().toISOString();

  const itin: Itinerary = {
    id: uid('itin'),
    type: 'NN',
    continent: '',
    country: String(payload.country ?? payload.destination ?? ''),
    seq: 0,
    title: String(payload.title ?? 'Lịch trình nháp'),
    destination: String(payload.destination ?? ''),
    days,
    nights: typeof payload.nights === 'number' ? payload.nights : Math.max(0, days - 1),
    intro: String(payload.intro ?? ''),
    flights: [],
    schedule: sched.map((d, i) => ({
      id: uid('day'),
      dayNum: d.day ?? i + 1,
      date: '',
      title: String(d.title ?? `Ngày ${i + 1}`),
      meals: { B: !!d.meals?.breakfast, L: !!d.meals?.lunch, D: !!d.meals?.dinner },
      mealNote: '',
      segments: [{
        id: uid('seg'), groupLabel: '', transport: '',
        activities: (d.activities ?? []).map((t) => ({ id: uid('act'), time: '', text: String(t) })),
      }],
    })),
    includes: Array.isArray(payload.includes) ? (payload.includes as string[]).map(String) : [],
    excludes: Array.isArray(payload.excludes) ? (payload.excludes as string[]).map(String) : [],
    linkedQuoteId: null,
    linkedQuoteName: '',
    createdBy: user?.name ?? '',
    createdAt: now,
    updatedAt: now,
    updatedBy: user?.name ?? '',
  };

  await useItineraryStore.getState().save(itin, user?.name ?? 'unknown');
  // Điều hướng sang trình soạn thảo lịch trình (ItineraryApp consume linkNav khi mount).
  useLinkNavStore.getState().request('itinerary', itin.id);
  useQuoteStore.setState((s) => ({ draft: { ...s.draft, template: 'itinerary' as Template }, view: 'cost' }));
}

type QuoteItemIn = { category?: string; name?: string; price?: number; perPax?: boolean };

let itemId = 1;
function mkItem(i: QuoteItemIn): Item {
  return {
    id: Date.now() * 1000 + (itemId++),
    name: String(i.name ?? ''),
    note: '',
    cur: 'VND',
    price: Number(i.price) || 0,
    times: 1,
    qtyMode: i.perPax === false ? 'per_group' : 'per_pax',
    customQty: 0,
    unit: '',
    enabled: true,
    foc: false,
  };
}

/** Dựng nháp báo giá → nạp vào quoteStore (báo giá mới) + mở màn chi phí. */
export function applyQuoteDraft(payload: Record<string, unknown>): void {
  const template = (payload.template === 'intl' ? 'intl' : 'domestic') as Template;
  const rawItems = (Array.isArray(payload.items) ? payload.items : []) as QuoteItemIn[];
  const validCats = new Set(CATEGORY_ENUM);

  const items: Partial<Record<CategoryId, Item[]>> = {};
  rawItems.forEach((it) => {
    const cat = (validCats.has(String(it.category)) ? it.category : 'other') as CategoryId;
    (items[cat] ??= []).push(mkItem(it));
  });

  const catEnabled = Object.fromEntries(
    getCATS(template).map((c) => [c.id, !!items[c.id as CategoryId]?.length]),
  ) as Record<CategoryId, boolean>;

  const days = typeof payload.days === 'number' ? payload.days : 1;
  const data: Partial<QuoteDraft> = {
    template,
    info: { name: String(payload.title ?? ''), dest: String(payload.destination ?? ''), days, nights: Math.max(0, days - 1), startDate: null },
    pax: typeof payload.pax === 'number' ? Math.max(1, payload.pax) : 20,
    margin: typeof payload.margin === 'number' ? payload.margin : 5,
    vat: typeof payload.vat === 'number' ? payload.vat : 8,
    svcBasis: typeof payload.svcBasis === 'number' ? payload.svcBasis : 0,
    items,
    catEnabled,
  };
  useQuoteStore.getState().applyImport(data);
}
