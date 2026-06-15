/**
 * Tool cho Trợ lý ảo — định nghĩa (schema gửi Claude) + thực thi cục bộ trên dữ
 * liệu ĐÃ LỌC QUYỀN (xem `data.ts`). Tất cả chỉ ĐỌC.
 */
import { filterRank, normalizeVN } from '@/lib/search';
import { computeTotals } from '@/components/quote/calc';
import { fbGetQuoteProject, fbGetDMCQuoteProject } from '@/lib/firebase';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useMenuStore } from '@/stores/menuStore';
import { usePoiStore } from '@/stores/poiStore';
import { permittedIndex, permittedData, visibleQuotesAll } from './data';
import type { CloudQuoteEntry } from '@/types';

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const KIND_ENUM = [
  'quoteDom', 'quoteIntl', 'dmc', 'itinerary', 'menu',
  'contract', 'visaProject', 'visaProc', 'customer', 'ncc',
];

export const CATEGORY_ENUM = [
  'flight', 'hotel', 'transport', 'meal', 'sight', 'gala', 'logistics',
  'staff', 'insurance', 'visa', 'other',
];

export const ASSISTANT_TOOLS: ToolDef[] = [
  {
    name: 'search_records',
    description:
      'Tìm bản ghi nội bộ theo từ khoá: báo giá (quoteDom/quoteIntl/dmc), chương trình (itinerary), '
      + 'thực đơn (menu), hợp đồng (contract), dự án/hồ sơ visa (visaProject/visaProc), khách hàng (customer), '
      + 'nhà cung cấp (ncc). Trả về danh sách khớp (kind, id, title, subtitle). Dùng id để gọi tool chi tiết.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Từ khoá (có dấu hay không đều được)' },
        kinds: { type: 'array', items: { type: 'string', enum: KIND_ENUM }, description: 'Lọc theo loại (tuỳ chọn)' },
        limit: { type: 'number', description: 'Số kết quả tối đa (mặc định 15)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_quote',
    description: 'Chi tiết một báo giá theo cloudId: thông tin tour, pax, ngày, tổng chi phí, service charge (svcBasis VND), margin %, VAT %, và các hạng mục chi phí.',
    input_schema: {
      type: 'object',
      properties: { cloudId: { type: 'string' } },
      required: ['cloudId'],
    },
  },
  {
    name: 'customer_tours',
    description: 'Liệt kê các báo giá/tour gắn với một khách hàng (theo tên). Trả về mã, tên tour, loại, pax, tổng chi phí, ngày cập nhật.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Tên khách hàng (một phần cũng được)' } },
      required: ['name'],
    },
  },
  {
    name: 'supplier_usage',
    description: 'Tra một nhà cung cấp đã ký hợp đồng cho những tour nào (dựa trên hợp đồng — bên B). Trả về số hợp đồng, tên tour, điểm đến.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Tên nhà cung cấp (một phần cũng được)' } },
      required: ['name'],
    },
  },
  {
    name: 'pricing_stats',
    description: 'Thống kê mức giá trung bình trên các báo giá user được xem: margin % trung bình, VAT % trung bình, service charge (svcBasis VND) trung bình. Lọc theo loại báo giá và/hoặc từ khoá (điểm đến/tên).',
    input_schema: {
      type: 'object',
      properties: {
        template: { type: 'string', enum: ['domestic', 'intl', 'dmc'], description: 'Lọc loại báo giá (tuỳ chọn)' },
        keyword: { type: 'string', description: 'Lọc theo tên tour / khách / điểm đến (tuỳ chọn)' },
        max: { type: 'number', description: 'Số báo giá lấy mẫu tối đa (mặc định 15, trần 25)' },
      },
    },
  },
  {
    name: 'list_itineraries',
    description: 'Liệt kê các chương trình tour (lịch trình) đã lưu, tuỳ chọn lọc theo điểm đến. Dùng để tham khảo khi tư vấn lịch trình.',
    input_schema: { type: 'object', properties: { destination: { type: 'string', description: 'Điểm đến cần lọc (tuỳ chọn)' } } },
  },
  {
    name: 'get_itinerary',
    description: 'Chi tiết một chương trình tour theo id: tiêu đề, điểm đến, số ngày/đêm, giới thiệu, và lịch trình từng ngày (tiêu đề ngày, bữa ăn, hoạt động).',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'search_pois',
    description: 'Tìm điểm tham quan trong thư viện thuyết minh (POI) theo từ khoá/điểm đến — gồm tên điểm và nội dung thuyết minh. Dùng khi dựng/tư vấn lịch trình.',
    input_schema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
  },
  {
    name: 'list_menus',
    description: 'Liệt kê các thực đơn đã lưu, tuỳ chọn lọc theo điểm đến.',
    input_schema: { type: 'object', properties: { destination: { type: 'string' } } },
  },
  {
    name: 'get_menu',
    description: 'Chi tiết một thực đơn theo id: tiêu đề, điểm đến, và từng ngày (nhà hàng, thành phố, món gợi ý, giá).',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'propose_itinerary',
    description: 'Đề xuất một bản NHÁP lịch trình để người dùng mở trong trình soạn thảo (1-chạm). CHỈ gọi khi người dùng muốn TẠO/SOẠN lịch trình mới. Sau khi gọi, báo cho người dùng bấm nút bên dưới để mở nháp.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        destination: { type: 'string' },
        country: { type: 'string' },
        days: { type: 'number' },
        nights: { type: 'number' },
        intro: { type: 'string' },
        schedule: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              day: { type: 'number' },
              title: { type: 'string' },
              meals: {
                type: 'object',
                properties: { breakfast: { type: 'boolean' }, lunch: { type: 'boolean' }, dinner: { type: 'boolean' } },
              },
              activities: { type: 'array', items: { type: 'string' }, description: 'Các hoạt động trong ngày (mỗi mục 1 dòng)' },
            },
            required: ['title', 'activities'],
          },
        },
        includes: { type: 'array', items: { type: 'string' } },
        excludes: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'schedule'],
    },
  },
  {
    name: 'propose_quote',
    description: 'Đề xuất một bản NHÁP báo giá để người dùng mở trong trình soạn thảo (1-chạm). CHỈ gọi khi người dùng muốn TẠO/SOẠN báo giá mới. Giá theo VND.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        destination: { type: 'string' },
        days: { type: 'number' },
        pax: { type: 'number' },
        template: { type: 'string', enum: ['domestic', 'intl'], description: 'domestic = nội địa, intl = nước ngoài' },
        margin: { type: 'number', description: 'Lợi nhuận %' },
        vat: { type: 'number', description: 'VAT %' },
        svcBasis: { type: 'number', description: 'Service charge (VND)' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string', enum: CATEGORY_ENUM },
              name: { type: 'string' },
              price: { type: 'number', description: 'Đơn giá VND' },
              perPax: { type: 'boolean', description: 'true = tính theo khách, false = theo đoàn' },
            },
            required: ['category', 'name', 'price'],
          },
        },
      },
      required: ['title', 'items'],
    },
  },
];

// ── Thực thi ──

function str(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  return typeof v === 'string' ? v : '';
}

async function loadState(entry: CloudQuoteEntry) {
  const proj = entry.template === 'dmc'
    ? await fbGetDMCQuoteProject(entry.cloudId)
    : await fbGetQuoteProject(entry.cloudId);
  return proj?.currentState ?? null;
}

async function toolSearch(input: Record<string, unknown>): Promise<unknown> {
  const query = str(input, 'query');
  const kinds = Array.isArray(input.kinds) ? (input.kinds as string[]) : null;
  const limit = typeof input.limit === 'number' ? input.limit : 15;
  let idx = permittedIndex();
  if (kinds && kinds.length) idx = idx.filter((it) => kinds.includes(it.kind));
  const hits = filterRank(idx, query, (it) => it.text).slice(0, Math.min(limit, 40));
  return { count: hits.length, results: hits.map((it) => ({ kind: it.kind, id: it.id, title: it.title, subtitle: it.subtitle })) };
}

async function toolGetQuote(input: Record<string, unknown>): Promise<unknown> {
  const cloudId = str(input, 'cloudId');
  const entry = visibleQuotesAll().find((e) => e.cloudId === cloudId);
  if (!entry) return { error: 'Không tìm thấy báo giá này trong phạm vi bạn được xem.' };
  const state = await loadState(entry);
  if (!state) return { error: 'Không tải được nội dung báo giá.' };
  const totals = computeTotals(state);
  const items: { category: string; lines: { name: string; price: number; cur: string }[] }[] = [];
  Object.entries(state.items ?? {}).forEach(([cat, arr]) => {
    const lines = (arr ?? []).filter((it) => it.enabled !== false).map((it) => ({ name: it.name, price: it.price, cur: it.cur }));
    if (lines.length) items.push({ category: cat, lines });
  });
  return {
    name: entry.name, quoteCode: entry.quoteCode, template: entry.template,
    customer: entry.customerName ?? null,
    destination: state.info?.dest ?? null, days: state.info?.days ?? null, startDate: state.info?.startDate ?? null,
    pax: state.pax, totalCostVND: totals.totalCost,
    serviceChargeVND: state.svcBasis, marginPct: state.margin, vatPct: state.vat,
    items,
  };
}

async function toolCustomerTours(input: Record<string, unknown>): Promise<unknown> {
  const q = normalizeVN(str(input, 'name'));
  if (!q) return { error: 'Thiếu tên khách hàng.' };
  const hits = visibleQuotesAll().filter((e) => normalizeVN(e.customerName ?? '').includes(q));
  return {
    count: hits.length,
    tours: hits.map((e) => ({
      cloudId: e.cloudId, quoteCode: e.quoteCode, name: e.name, template: e.template,
      pax: e.pax, totalCostVND: e.totalCost, updatedAt: e.updatedAt, customer: e.customerName ?? null,
    })),
  };
}

async function toolSupplierUsage(input: Record<string, unknown>): Promise<unknown> {
  const q = normalizeVN(str(input, 'name'));
  if (!q) return { error: 'Thiếu tên nhà cung cấp.' };
  const cons = permittedData().contracts.filter((c) => normalizeVN(c.partyB?.name ?? '').includes(q));
  return {
    count: cons.length,
    note: 'Dựa trên hợp đồng (bên B). Có thể chưa bao gồm NCC chỉ xuất hiện trong chi phí/thanh toán.',
    contracts: cons.map((c) => ({
      id: c.id, contractNo: c.contractNo, tour: c.tourName, destination: c.tourDest, supplier: c.partyB?.name ?? null,
    })),
  };
}

async function toolPricingStats(input: Record<string, unknown>): Promise<unknown> {
  const template = str(input, 'template');
  const keyword = normalizeVN(str(input, 'keyword'));
  const max = Math.min(typeof input.max === 'number' ? input.max : 15, 25);
  let entries = visibleQuotesAll();
  if (template) entries = entries.filter((e) => e.template === template);
  if (keyword) entries = entries.filter((e) => normalizeVN(`${e.name} ${e.customerName ?? ''}`).includes(keyword));
  entries = [...entries].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')).slice(0, max);

  const states = (await Promise.all(entries.map((e) => loadState(e)))).filter((s): s is NonNullable<typeof s> => !!s);
  if (!states.length) return { sampleSize: 0, note: 'Không có báo giá khớp để thống kê.' };
  const avg = (f: (s: (typeof states)[number]) => number) => Math.round((states.reduce((sum, s) => sum + (f(s) || 0), 0) / states.length) * 100) / 100;
  return {
    sampleSize: states.length,
    filters: { template: template || 'tất cả', keyword: str(input, 'keyword') || 'không' },
    avgMarginPct: avg((s) => s.margin),
    avgVatPct: avg((s) => s.vat),
    avgServiceChargeVND: avg((s) => s.svcBasis),
  };
}

async function toolListItineraries(input: Record<string, unknown>): Promise<unknown> {
  const dest = normalizeVN(str(input, 'destination'));
  let list = permittedData().itineraries;
  if (dest) list = list.filter((x) => normalizeVN(`${x.destination ?? ''} ${x.title}`).includes(dest));
  return { count: list.length, itineraries: list.map((x) => ({ id: x.id, title: x.title, destination: x.destination, days: x.days })) };
}

async function toolGetItinerary(input: Record<string, unknown>): Promise<unknown> {
  const id = str(input, 'id');
  if (!permittedData().itineraries.some((x) => x.id === id)) return { error: 'Không tìm thấy chương trình này trong phạm vi bạn được xem.' };
  const it = await useItineraryStore.getState().load(id);
  if (!it) return { error: 'Không tải được chương trình.' };
  return {
    title: it.title, destination: it.destination, days: it.days, nights: it.nights, intro: it.intro,
    schedule: (it.schedule ?? []).map((d) => ({
      day: d.dayNum, title: d.title,
      meals: [d.meals?.B && 'Sáng', d.meals?.L && 'Trưa', d.meals?.D && 'Tối'].filter(Boolean),
      activities: (d.segments ?? []).flatMap((s) => (s.activities ?? []).map((a) => a.text)).filter(Boolean),
    })),
  };
}

async function toolSearchPois(input: Record<string, unknown>): Promise<unknown> {
  const q = normalizeVN(str(input, 'query'));
  const limit = typeof input.limit === 'number' ? input.limit : 12;
  const pois = usePoiStore.getState().pois;
  const hits = (q
    ? pois.filter((p) => normalizeVN(`${p.place} ${p.destination ?? ''} ${p.commentary}`).includes(q))
    : pois
  ).slice(0, Math.min(limit, 30));
  return { count: hits.length, pois: hits.map((p) => ({ place: p.place, destination: p.destination ?? null, commentary: (p.commentary ?? '').slice(0, 600) })) };
}

async function toolListMenus(input: Record<string, unknown>): Promise<unknown> {
  const dest = normalizeVN(str(input, 'destination'));
  let list = permittedData().menus;
  if (dest) list = list.filter((x) => normalizeVN(`${x.destination ?? ''} ${x.title}`).includes(dest));
  return { count: list.length, menus: list.map((x) => ({ id: x.id, title: x.title, destination: x.destination, days: x.days })) };
}

async function toolGetMenu(input: Record<string, unknown>): Promise<unknown> {
  const id = str(input, 'id');
  if (!permittedData().menus.some((x) => x.id === id)) return { error: 'Không tìm thấy thực đơn này trong phạm vi bạn được xem.' };
  const m = await useMenuStore.getState().load(id);
  if (!m) return { error: 'Không tải được thực đơn.' };
  return {
    title: m.title, destination: m.destination, days: m.days,
    schedule: (m.schedule ?? []).map((d) => ({
      day: d.dayNum, city: d.city,
      meals: (d.meals ?? []).map((meal) => ({
        type: meal.mealType, restaurant: meal.restaurantName, city: meal.city,
        dishes: meal.adjustedDishes || meal.suggestedDishes,
        price: meal.adjustedPrice || meal.suggestedPrice, cur: meal.cur,
      })),
    })),
  };
}

/** Các tool "đề xuất nháp" — không đổi dữ liệu, chỉ báo cho UI dựng nút mở nháp. */
export const PROPOSAL_TOOLS = new Set(['propose_itinerary', 'propose_quote']);

/** Thực thi một tool, trả chuỗi JSON cho tool_result. */
export async function runAssistantTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    let result: unknown;
    switch (name) {
      case 'search_records': result = await toolSearch(input); break;
      case 'get_quote': result = await toolGetQuote(input); break;
      case 'customer_tours': result = await toolCustomerTours(input); break;
      case 'supplier_usage': result = await toolSupplierUsage(input); break;
      case 'pricing_stats': result = await toolPricingStats(input); break;
      case 'list_itineraries': result = await toolListItineraries(input); break;
      case 'get_itinerary': result = await toolGetItinerary(input); break;
      case 'search_pois': result = await toolSearchPois(input); break;
      case 'list_menus': result = await toolListMenus(input); break;
      case 'get_menu': result = await toolGetMenu(input); break;
      case 'propose_itinerary':
        result = { ok: true, message: `Đã chuẩn bị bản nháp lịch trình "${str(input, 'title')}". Mời người dùng bấm nút "📋 Mở nháp lịch trình" bên dưới để mở trong trình soạn thảo.` };
        break;
      case 'propose_quote':
        result = { ok: true, message: `Đã chuẩn bị bản nháp báo giá "${str(input, 'title')}". Mời người dùng bấm nút "📋 Mở nháp báo giá" bên dưới.` };
        break;
      default: result = { error: `Tool không hỗ trợ: ${name}` };
    }
    return JSON.stringify(result);
  } catch (e) {
    return JSON.stringify({ error: (e as Error).message });
  }
}
