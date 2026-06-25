/**
 * Index dữ liệu hợp nhất cho tìm kiếm — dùng chung cho GlobalSearch (UI) và Trợ lý
 * ảo (tool-use). Thuần: nhận các mảng dữ liệu (đã lọc quyền ở nơi gọi nếu cần) và
 * trả về danh sách item chuẩn hoá để `filterRank`.
 */
import type {
  Contract, Customer, ItineraryIndexEntry, MenuIndexEntry, Ncc, CloudQuoteEntry,
  VisaProcIndexEntry, VisaProjectDoc, TourProfile,
} from '@/types';

export type IndexKind =
  | 'quoteDom' | 'quoteIntl' | 'dmc' | 'itinerary' | 'menu'
  | 'contract' | 'visaProject' | 'visaProc' | 'customer' | 'ncc' | 'tourProfile';

export interface IndexItem {
  kind: IndexKind;
  id: string;
  title: string;
  subtitle: string;
  text: string;
}

export interface SearchIndexInput {
  quotes?: CloudQuoteEntry[];
  dmcQuotes?: CloudQuoteEntry[];
  contracts?: Contract[];
  customers?: Customer[];
  suppliers?: Ncc[];
  itineraries?: ItineraryIndexEntry[];
  menus?: MenuIndexEntry[];
  visaProjects?: VisaProjectDoc[];
  visaProcs?: VisaProcIndexEntry[];
  tourProfiles?: TourProfile[];
}

const txt = (parts: (string | undefined | null)[]): string => parts.filter(Boolean).join(' ');
const sub = (parts: (string | undefined | null)[]): string => parts.filter(Boolean).join(' · ');

export function buildSearchIndex(d: SearchIndexInput): IndexItem[] {
  const out: IndexItem[] = [];

  (d.quotes ?? []).forEach((x) => out.push({
    kind: x.template === 'domestic' ? 'quoteDom' : 'quoteIntl', id: x.cloudId,
    title: x.name, subtitle: sub([x.quoteCode, x.customerName]),
    text: txt([x.name, x.quoteCode, x.customerName]),
  }));
  (d.dmcQuotes ?? []).forEach((x) => out.push({
    kind: 'dmc', id: x.cloudId, title: x.name, subtitle: x.quoteCode ?? '',
    text: txt([x.name, x.quoteCode, x.customerName]),
  }));
  (d.contracts ?? []).forEach((c) => out.push({
    kind: 'contract', id: c.id, title: c.tourName || c.contractNo,
    subtitle: sub([c.contractNo, c.tourDest]),
    text: txt([c.tourName, c.contractNo, c.tourDest, c.partyB?.name]),
  }));
  (d.customers ?? []).forEach((c) => out.push({
    kind: 'customer', id: c.id, title: c.name,
    subtitle: sub([c.taxCode, c.contacts?.[0]?.name]),
    text: txt([c.name, c.taxCode, ...(c.contacts ?? []).map((k) => `${k.name} ${k.phone}`)]),
  }));
  (d.suppliers ?? []).forEach((n) => out.push({
    kind: 'ncc', id: n.id, title: n.name,
    subtitle: sub([n.location, (n.sectors ?? []).join(', ')]),
    text: txt([n.name, n.location, (n.sectors ?? []).join(' '), n.note]),
  }));
  (d.itineraries ?? []).forEach((x) => out.push({
    kind: 'itinerary', id: x.id, title: x.title, subtitle: sub([x.code, x.destination]),
    text: txt([x.title, x.code, x.destination]),
  }));
  (d.menus ?? []).forEach((x) => out.push({
    kind: 'menu', id: x.id, title: x.title, subtitle: sub([x.code, x.destination]),
    text: txt([x.title, x.code, x.destination]),
  }));
  (d.visaProjects ?? []).forEach((p) => out.push({
    kind: 'visaProject', id: p.id, title: p.name || p.code, subtitle: sub([p.code, p.country]),
    text: txt([p.name, p.code, p.country]),
  }));
  (d.visaProcs ?? []).forEach((x) => out.push({
    kind: 'visaProc', id: x.id, title: x.title, subtitle: sub([x.code, x.country]),
    text: txt([x.title, x.code, x.country]),
  }));
  (d.tourProfiles ?? []).forEach((p) => out.push({
    kind: 'tourProfile', id: p.id, title: p.name || p.code, subtitle: sub([p.code, p.customerName]),
    text: txt([p.code, p.name, p.customerName, p.dest]),
  }));

  return out;
}
