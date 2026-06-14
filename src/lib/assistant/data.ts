/**
 * Lớp dữ liệu cho Trợ lý ảo — gom dữ liệu từ các store, ĐÃ LỌC theo quyền xem của
 * user hiện tại (giống các View). Trợ lý chỉ được "thấy" đúng phần này.
 */
import { useAuthStore } from '@/stores/authStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useContractStore } from '@/stores/contractStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useNccStore } from '@/stores/nccStore';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useMenuStore } from '@/stores/menuStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useVisaProcStore } from '@/stores/visaProcStore';
import { canViewAll, type SharedArea } from '@/auth/ROLES';
import { visibleVisaProjects } from '@/components/visa/visaAccess';
import { buildSearchIndex, type IndexItem, type SearchIndexInput } from '@/lib/searchIndex';
import type { CloudQuoteEntry } from '@/types';

/** Báo giá user được xem (thường + DMC). */
export function visibleQuotesAll(): CloudQuoteEntry[] {
  const h = useQuoteHistoryStore.getState();
  return [...h.visibleQuotes(), ...h.visibleQuotes('dmc')];
}

/** Lọc danh sách shared-area theo quyền: viewAll → tất cả, ngược lại chỉ của mình. */
function ownOr<T extends { createdBy?: string }>(arr: T[], area: SharedArea): T[] {
  const u = useAuthStore.getState().currentUser;
  if (u && canViewAll(u.role, area)) return arr;
  return arr.filter((x) => x.createdBy === u?.name);
}

/** Toàn bộ dữ liệu user được phép xem, gom theo nhóm. */
export function permittedData(): Required<SearchIndexInput> {
  const u = useAuthStore.getState().currentUser;
  return {
    quotes: useQuoteHistoryStore.getState().visibleQuotes(),
    dmcQuotes: useQuoteHistoryStore.getState().visibleQuotes('dmc'),
    contracts: ownOr(useContractStore.getState().contracts, 'contracts'),
    customers: ownOr(useCustomerStore.getState().customers, 'customers'),
    suppliers: ownOr(useNccStore.getState().suppliers, 'ncc'),
    itineraries: ownOr(useItineraryStore.getState().list, 'itinerary'),
    menus: ownOr(useMenuStore.getState().list, 'menu'),
    visaProjects: visibleVisaProjects(u, useVisaProjectStore.getState().projects),
    visaProcs: useVisaProcStore.getState().list.filter(
      (p) => p.createdByUsername === u?.u || (p.collaborators ?? []).includes(u?.u ?? ''),
    ),
  };
}

/** Index hợp nhất (đã lọc quyền) để search. */
export function permittedIndex(): IndexItem[] {
  return buildSearchIndex(permittedData());
}
