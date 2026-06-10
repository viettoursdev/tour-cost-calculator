/**
 * Import a quote draft from a .xlsx file exported by this app.
 * Ported from legacy importExcelPro at public/legacy.html:2936.
 *
 * Strategy: prefer parsing the visible table (so user edits to prices/items are
 * honoured), and read the hidden `_vtemeta` sheet for exact config (rates,
 * margin, vat, rounding, catEnabled, inclusions/exclusions/payments). If no
 * table is found, fall back entirely to the metadata.
 */
import ExcelJS from 'exceljs';
import { getCATS } from '@/components/quote/constants';
import type { CategoryId, Item, QuoteDraft } from '@/types';

type Meta = Partial<QuoteDraft> & {
  rates?: Record<string, number>;
  catEnabled?: Record<CategoryId, boolean>;
  items?: Partial<Record<CategoryId, Item[]>>;
};

const DEFAULT_RATES: Record<string, number> = {
  VND: 1, USD: 26500, GBP: 36300, EUR: 31500, JPY: 170,
  SGD: 19200, THB: 720, CNY: 3500, KRW: 18.5, AUD: 16800,
};

function cellText(ws: ExcelJS.Worksheet, r: number, c: number): string | number {
  const v = ws.getCell(r, c).value;
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
    if (o.result != null) return o.result as string | number;
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.text != null) return o.text;
    return '';
  }
  return v as string | number;
}

/** Parse an .xlsx file into a partial QuoteDraft. Throws on unrecognised files. */
export async function importExcelQuote(file: File): Promise<Partial<QuoteDraft>> {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  // ── Metadata sheet (exact config + round-trip extras) ──
  let meta: Meta | null = null;
  const ms = wb.getWorksheet('_vtemeta');
  if (ms && String(cellText(ms, 1, 1)) === 'VTE_QUOTE_V1') {
    try {
      const raw = cellText(ms, 2, 1);
      meta = JSON.parse(String(raw)) as Meta;
    } catch { /* ignore malformed meta */ }
  }

  const ws = wb.worksheets.find((w) => w.name !== '_vtemeta') ?? wb.worksheets[0];
  const getV = (r: number, c: number) => cellText(ws, r, c);

  // Locate the table header row (col 1 === "STT").
  let H = 0;
  for (let r = 1; r <= 20; r++) {
    if (String(getV(r, 1)).trim().toUpperCase() === 'STT') { H = r; break; }
  }

  // No table → fall back fully to metadata.
  if (!H) {
    if (meta?.template) {
      const { template, info, pax, rates, margin, vat, svcBasis, rounding, items, catEnabled, inclusions, exclusions, payments } = meta;
      return {
        template, info, pax, rates, margin, vat,
        svcBasis: svcBasis ?? 0, rounding: rounding ?? 100000, items, catEnabled,
        ...(inclusions ? { inclusions } : {}),
        ...(exclusions ? { exclusions } : {}),
        ...(payments ? { payments } : {}),
      };
    }
    throw new Error('Không nhận diện được bảng báo giá. Vui lòng dùng file xuất từ hệ thống.');
  }

  const foreign = String(getV(H, 5)).trim().toUpperCase() === 'NT';

  // Info block (matches exportExcelQuote layout).
  const info: QuoteDraft['info'] = {
    name: String(getV(4, 2)) || 'Nhập từ Excel',
    dest: String(getV(5, 3)) || '',
    days: 1, nights: 0, startDate: null,
  };
  const mD = String(getV(7, 3)).match(/(\d+)\s*N\s*(\d+)/i);
  if (mD) { info.days = +mD[1]; info.nights = +mD[2]; }
  const pax = +String(getV(6, 3)).replace(/[^\d]/g, '') || 20;

  // Map category label → id.
  const catByLabel: Record<string, CategoryId> = {};
  getCATS('intl').concat(getCATS('domestic')).forEach((c) => { catByLabel[c.label] = c.id as CategoryId; });

  const items: Partial<Record<CategoryId, Item[]>> = {};
  let curCat: CategoryId | null = null;
  for (let r = H + 1; r < 400; r++) {
    const a = getV(r, 1);
    const b = String(getV(r, 2)).trim();
    const c = String(getV(r, 3)).trim();
    const isTotal = b.startsWith('Tổng chi phí') || b.startsWith('TỔNG');
    if (isTotal || (String(a).trim() === '' && b === '' && c === '')) break;
    if (b && catByLabel[b]) curCat = catByLabel[b];
    if (!c) continue;
    const cid = curCat ?? 'flight';
    if (!items[cid]) items[cid] = [];
    const item: Item = foreign
      ? {
          id: Date.now() + Math.floor(Math.random() * 1e6), name: c, note: String(getV(r, 4)),
          cur: String(getV(r, 5)).trim() || 'VND', price: +getV(r, 6) || 0, times: +getV(r, 9) || 1,
          qtyMode: 'custom', customQty: +getV(r, 8) || 1,
          unit: '/' + String(getV(r, 10)).replace(/^\//, ''), enabled: true, foc: false,
        }
      : {
          id: Date.now() + Math.floor(Math.random() * 1e6), name: c, note: String(getV(r, 4)),
          cur: 'VND', price: +getV(r, 5) || 0, times: +getV(r, 7) || 1,
          qtyMode: 'custom', customQty: +getV(r, 6) || 1,
          unit: '/' + String(getV(r, 8)).replace(/^\//, ''), enabled: true, foc: false,
        };
    items[cid]!.push(item);
  }

  // Config: prefer metadata, else sensible defaults.
  const template: QuoteDraft['template'] = foreign ? 'intl' : 'domestic';
  const rates = meta?.rates ?? DEFAULT_RATES;
  const margin = meta?.margin ?? 5;
  const vat = meta?.vat ?? (foreign ? 0 : 8);
  const rounding = meta?.rounding ?? 100000;
  const catEnabled = (meta?.catEnabled
    ?? Object.fromEntries(getCATS(template).map((c) => [c.id, true]))) as Record<CategoryId, boolean>;

  return {
    template, info, pax, rates, margin, vat, svcBasis: meta?.svcBasis ?? 0, rounding, items, catEnabled,
    ...(meta?.inclusions ? { inclusions: meta.inclusions } : {}),
    ...(meta?.exclusions ? { exclusions: meta.exclusions } : {}),
    ...(meta?.payments ? { payments: meta.payments } : {}),
  };
}
