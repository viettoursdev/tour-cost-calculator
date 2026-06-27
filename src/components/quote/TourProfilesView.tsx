import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  Autocomplete, Avatar, AvatarGroup, Box, Button, Checkbox, Chip, Collapse, createFilterOptions, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, Paper, Stack, Switch,
  Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import VisibilityIcon from '@mui/icons-material/Visibility';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import AddIcon from '@mui/icons-material/Add';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import BarChartIcon from '@mui/icons-material/BarChart';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import GavelIcon from '@mui/icons-material/Gavel';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import HistoryIcon from '@mui/icons-material/History';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import SendIcon from '@mui/icons-material/Send';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import DensitySmallIcon from '@mui/icons-material/DensitySmall';
import DensityLargeIcon from '@mui/icons-material/DensityLarge';
import TableRowsIcon from '@mui/icons-material/TableRows';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import { uploadFileToWorker } from '@/lib/aiWorker';
import { openFilePreview } from '@/stores/filePreviewStore';
import { useAuthStore } from '@/stores/authStore';
import { useTourProfileStore } from '@/stores/tourProfileStore';
import { useExportRequestStore } from '@/stores/exportRequestStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useContractStore } from '@/stores/contractStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useMenuStore } from '@/stores/menuStore';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useGuideScheduleStore } from '@/stores/guideScheduleStore';
import { canShareRecord } from '@/auth/recordAccess';
import { userLabel, isApprover, isBoard } from '@/auth/ROLES';
import {
  sbSendNotification, sbGetQuoteFlights, sbSubscribeAuditLog,
  sbEnsureNotifThread, sbSubscribeNotifThread, sbAddThreadComment, sbSendNotificationMany,
} from '@/lib/supabase';
import { filterRank } from '@/lib/search';
import { canSeePrices } from '@/auth/quotePerms';
import {
  TOUR_CATEGORIES, categoryMeta, tourCategoryOf, categoryKind,
  deleteNeedsApproval, canApproveDelete,
  tourProfileRisks, topRiskLevel, tourProfileTimeline,
  tourProfileClosingChecklist, closingPending, tourProfileMilestones, clonedQuoteName,
  customerPortfolio, marginSummary, groupByDepartureDay, marginGuard, LOW_MARGIN_THRESHOLD,
  type TourRisk, type TourRiskLevel, type ClosingItem, type Milestone, type MilestoneLevel,
  type MarginSummary, type CustomerPortfolio, type ProfilePortfolioRow, type DepartureRow,
} from '@/lib/tourProfile';
import { fmtVND, computeTotals } from './calc';
import { contractFlags, dealStage, DEAL_STAGES, DEAL_STAGE_LOST, type DealStage } from './dealStage';
import { DealCockpit } from './DealCockpit';
import { FlightSummary } from './FlightSummary';
import { exportTourProfilesExcel, type TourProfileExportRow } from '@/lib/exports/exportTourProfilesExcel';
import type { TourProfilePdfData } from '@/lib/exports/exportTourProfilePDF';
import { LEGACY } from '@/theme';
import { QUOTE_VALUE_ROLE_LABEL } from '@/types';
import type { AuditAction, AuditEntry, CloudQuoteEntry, Collaborator, Customer, DeleteRequest, ExportRequest, FileAttachment, NotifComment, NotifThread, QuoteFlight, TourCategory, TourProfile, User } from '@/types';

const STAGE_META = (st: DealStage) =>
  st === 'lost' ? DEAL_STAGE_LOST : (DEAL_STAGES.find((s) => s.key === st) ?? DEAL_STAGES[0]);

/** Màu cho mức cảnh báo "cần chú ý". */
const RISK_COLOR: Record<TourRiskLevel, string> = { urgent: '#dc2626', warn: '#d97706' };

/** Màu cho mức độ gấp của mốc thời gian. */
const MILESTONE_COLOR: Record<MilestoneLevel, string> = {
  overdue: '#dc2626', soon: '#d97706', upcoming: '#2563eb', done: '#16a34a',
};

/** Nhãn đếm ngược cho 1 mốc (theo daysTo). */
const countdownLabel = (m: Milestone): string => {
  if (m.level === 'done') return 'Hoàn tất';
  if (m.daysTo < 0) return `Quá ${-m.daysTo} ngày`;
  if (m.daysTo === 0) return 'Hôm nay';
  return `Còn ${m.daysTo} ngày`;
};

/** Nhãn + màu cho hành động trong dòng thời gian (audit log). */
const ACTION_META: Record<AuditAction, { label: string; color: string }> = {
  create: { label: 'Tạo mới', color: '#16a34a' },
  update: { label: 'Cập nhật', color: '#2563eb' },
  delete: { label: 'Xoá', color: '#dc2626' },
};

const genCommentId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Số lượng thực thể liên kết gom theo hồ sơ (qua các báo giá thuộc hồ sơ). */
type ProfileLinks = { contract: number; visa: number; menu: number; itinerary: number };

/** Tuỳ chọn xuất Excel: khoảng ngày khởi hành + phân loại hồ sơ. */
type ExportFilters = { from: string; to: string; categories: TourCategory[] };

/** 3 mốc giá trị tour — tự suy từ dữ liệu liên kết (không nhập tay). */
type ProfileValues = {
  current?: number;     // báo giá chính (totalCost)
  contract?: number;    // hợp đồng liên kết (contractPax × pricePerPax)
  settlement?: number;  // nghiệm thu — doanh thu thực (actualCost + actualProfit)
};

/**
 * Thông tin cơ bản HIỂN THỊ (khách/ngày/số khách/điểm đến). Khi hồ sơ đã KHOÁ
 * (`infoLocked` — người dùng sửa tay) thì ưu tiên giá trị trên HỒ SƠ; ngược lại
 * ưu tiên BÁO GIÁ CHÍNH (đồng bộ) rồi mới fallback hồ sơ. Dùng `||` để coi
 * 0 / '' là "chưa đặt" → fallback hợp lý.
 */
function displayBasics(p: TourProfile, primary?: CloudQuoteEntry): {
  custName?: string; departDate?: string | null; pax?: number; dest?: string;
} {
  const lock = !!p.infoLocked;
  const pick = <T,>(prof: T | undefined | null, prim: T | undefined | null): T | undefined =>
    (lock ? (prof || prim) : (prim || prof)) || undefined;
  return {
    custName: pick(p.customerName, primary?.customerName),
    departDate: pick(p.startDate ?? undefined, primary?.departDate),
    pax: pick(p.pax, primary?.pax),
    dest: pick(p.dest, primary?.dest),
  };
}

/** Sentinel id cho tùy chọn "Tạo hồ sơ khách" trong Autocomplete khách hàng. */
const CREATE_CUSTOMER_ID = '__create_customer__';
const custFilter = createFilterOptions<Customer>();

const prefsKey = (u: string) => `vte_tourprofile_prefs_${u}`;
const loadExpanded = (u?: string): Set<string> => {
  if (!u) return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(prefsKey(u)) || '[]') as string[]); }
  catch { return new Set(); }
};

const densityKey = (u: string) => `vte_tourprofile_density_${u}`;
const loadDensity = (u?: string): 'comfortable' | 'compact' => {
  if (!u) return 'comfortable';
  return localStorage.getItem(densityKey(u)) === 'compact' ? 'compact' : 'comfortable';
};

const layoutKey = (u: string) => `vte_tourprofile_layout_${u}`;
const loadLayout = (u?: string): 'card' | 'table' => {
  if (!u) return 'card';
  return localStorage.getItem(layoutKey(u)) === 'table' ? 'table' : 'card';
};

const pinsKey = (u: string) => `vte_tourprofile_pins_${u}`;
const loadPins = (u?: string): Set<string> => {
  if (!u) return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(pinsKey(u)) || '[]') as string[]); }
  catch { return new Set(); }
};

/** Khoá sắp xếp danh sách hồ sơ. */
type SortKey = 'created' | 'depart' | 'value' | 'stage' | 'name';
const SORT_LABEL: Record<SortKey, string> = {
  created: 'Mới tạo', depart: 'Ngày khởi hành', value: 'Giá trị', stage: 'Giai đoạn', name: 'Tên / mã',
};

/** Một bộ lọc đã lưu (preset). */
type SavedView = {
  name: string;
  search: string; customer: string; category: TourCategory | ''; country: string; stages: DealStage[]; tag: string;
};
const viewsKey = (u: string) => `vte_tourprofile_views_${u}`;
const loadViews = (u?: string): SavedView[] => {
  if (!u) return [];
  try { return JSON.parse(localStorage.getItem(viewsKey(u)) || '[]') as SavedView[]; }
  catch { return []; }
};
const saveViews = (u: string, v: SavedView[]) => {
  try { localStorage.setItem(viewsKey(u), JSON.stringify(v)); } catch { /* ignore */ }
};

/**
 * Đợt 3 — "Hồ sơ tour": DANH SÁCH các hồ sơ tour user được xem (creator/collab/
 * follow/Trưởng-Phó Phòng cùng phòng/BGĐ-CEO). Mỗi hồ sơ xem nhanh (preview ẩn/hiện)
 * báo giá liên kết + giai đoạn + khách + thêm Collab (sửa) / Follow (theo dõi).
 * Bấm "Mở hồ sơ" → nạp báo giá chính & hiện Bảng điều hành (DealCockpit) tại chỗ.
 */
export function TourProfilesView() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const profiles = useTourProfileStore((s) => s.profiles);
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const contracts = useContractStore((s) => s.contracts);
  const visaProjects = useVisaProjectStore((s) => s.projects);
  const menus = useMenuStore((s) => s.list);
  const itineraries = useItineraryStore((s) => s.list);
  const guideAssignments = useGuideScheduleStore((s) => s.assignments);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const setPrimaryQuote = useTourProfileStore((s) => s.setPrimaryQuote);
  const archive = useTourProfileStore((s) => s.archive);
  const removeProfile = useTourProfileStore((s) => s.remove);
  const createProfile = useTourProfileStore((s) => s.create);
  const moveQuote = useTourProfileStore((s) => s.moveQuote);
  const requestDelete = useTourProfileStore((s) => s.requestDelete);
  const approveDelete = useTourProfileStore((s) => s.approveDelete);
  const rejectDelete = useTourProfileStore((s) => s.rejectDelete);
  const setBasicInfo = useTourProfileStore((s) => s.setBasicInfo);
  const exportRequests = useExportRequestStore((s) => s.requests);
  const requestExport = useExportRequestStore((s) => s.request);
  const approveExport = useExportRequestStore((s) => s.approve);
  const rejectExport = useExportRequestStore((s) => s.reject);
  const removeExport = useExportRequestStore((s) => s.remove);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);
  const showPrice = canSeePrices(currentUser);
  // Cổng xuất Excel hồ sơ tour SIẾT ở mức Ban Giám Đốc trở lên (cao hơn duyệt thường).
  const isExportApprover = !!currentUser && isBoard(currentUser.role);

  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showDash, setShowDash] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [fltCustomer, setFltCustomer] = useState<string>('');
  const [fltCategory, setFltCategory] = useState<TourCategory | ''>('');
  const [fltCountry, setFltCountry] = useState<string>('');
  const [fltStage, setFltStage] = useState<DealStage[]>([]);
  const [fltTag, setFltTag] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => loadDensity(currentUser?.u));
  const [layout, setLayout] = useState<'card' | 'table'>(() => loadLayout(currentUser?.u));
  const [pinned, setPinned] = useState<Set<string>>(() => loadPins(currentUser?.u));
  const [sortBy, setSortBy] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadViews(currentUser?.u));
  const [createOpen, setCreateOpen] = useState(false);
  const [moveState, setMoveState] = useState<{ cloudId: string; fromProfileId: string; quoteName: string } | null>(null);
  const [deleteState, setDeleteState] = useState<TourProfile | null>(null);
  const [requestDeleteState, setRequestDeleteState] = useState<TourProfile | null>(null);
  const [closeState, setCloseState] = useState<{ profile: TourProfile; items: ClosingItem[] } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [quickId, setQuickId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded(currentUser?.u));
  useEffect(() => { setDetailTab(0); }, [detailId]); // mở hồ sơ mới → về tab Tổng quan

  const visible = useTourProfileStore((s) => s.visibleProfiles);
  // Báo giá gom theo hồ sơ (1 hồ sơ : N báo giá).
  const quotesByProfile = useMemo(() => {
    const m = new Map<string, CloudQuoteEntry[]>();
    for (const q of quotes) {
      if (!q.tourProfileId) continue;
      const arr = m.get(q.tourProfileId) ?? [];
      arr.push(q);
      m.set(q.tourProfileId, arr);
    }
    return m;
  }, [quotes]);

  // ── Precompute meta MỘT LẦN cho mọi hồ sơ (O(n) thay vì O(rows×entities)). ──
  const meta = useMemo(() => {
    const quoteToProfile = new Map<string, string>();    // cloudId → profileId
    for (const q of quotes) if (q.tourProfileId) quoteToProfile.set(q.cloudId, q.tourProfileId);
    const contractByQuote = new Map<string, typeof contracts[number]>();
    for (const c of contracts) if (c.linkedQuoteId) contractByQuote.set(c.linkedQuoteId, c);

    type MetaVal = { primary?: CloudQuoteEntry; stage: DealStage; links: ProfileLinks; guide: number; values: ProfileValues; country?: string };
    const m = new Map<string, MetaVal>();
    // Đọc kép: thực thể thuộc hồ sơ nào (ưu tiên tourProfileId, fallback qua báo giá).
    const profOf = (e: { tourProfileId?: string | null; linkedQuoteId?: string | null }): string | undefined =>
      e.tourProfileId ?? (e.linkedQuoteId ? quoteToProfile.get(e.linkedQuoteId) : undefined);
    const ensure = (pid: string): MetaVal => {
      let v = m.get(pid);
      if (!v) { v = { stage: 'request', links: { contract: 0, visa: 0, menu: 0, itinerary: 0 }, guide: 0, values: {} }; m.set(pid, v); }
      return v;
    };
    // Hợp đồng đầu tiên + quốc gia (từ visa) gom theo hồ sơ — cho 3 mốc giá trị & lọc.
    const firstContractByProfile = new Map<string, typeof contracts[number]>();
    const countryByProfile = new Map<string, string>();
    for (const c of contracts) { const pid = profOf(c); if (pid) { ensure(pid).links.contract++; if (!firstContractByProfile.has(pid)) firstContractByProfile.set(pid, c); } }
    for (const v of visaProjects) { const pid = profOf(v); if (pid) { ensure(pid).links.visa++; if (v.country && !countryByProfile.has(pid)) countryByProfile.set(pid, v.country); } }
    for (const mn of menus) { const pid = profOf(mn); if (pid) ensure(pid).links.menu++; }
    for (const it of itineraries) { const pid = profOf(it); if (pid) ensure(pid).links.itinerary++; }
    // Lịch HDV keyed theo tourCloudId → quy về hồ sơ.
    for (const key of Object.keys(guideAssignments)) {
      const pid = quoteToProfile.get(key);
      if (pid) ensure(pid).guide++;
    }
    // Báo giá chính + giai đoạn + 3 mốc giá trị + quốc gia (suy từ báo giá chính / liên kết).
    for (const p of profiles) {
      const list = quotesByProfile.get(p.id) ?? [];
      const primary = list.find((q) => q.cloudId === p.primaryQuoteId) ?? list[0];
      const v = ensure(p.id);
      v.primary = primary;
      v.stage = primary
        ? dealStage({ status: primary.status, contract: contractFlags(contractByQuote.get(primary.cloudId)), departureISO: primary.departDate })
        : 'request';
      // 3 mốc giá trị — ưu tiên báo giá người dùng GẮN vai trò khi lưu (valueRole),
      // fallback về cách suy gián tiếp (hợp đồng liên kết / quyết toán) cho dữ liệu cũ.
      const taggedContract = list.find((q) => q.valueRole === 'contract');
      const taggedSettlement = list.find((q) => q.valueRole === 'settlement');
      const ct = (primary ? contractByQuote.get(primary.cloudId) : undefined) ?? firstContractByProfile.get(p.id);
      const st = primary?.settlementSummary;
      v.values = {
        current: primary?.totalCost,
        contract: taggedContract?.totalCost ?? (ct ? (ct.contractPax || 0) * (ct.pricePerPax || 0) : undefined),
        settlement: taggedSettlement?.totalCost ?? (st ? st.actualCost + st.actualProfit : undefined),
      };
      // Quốc gia: visa → nước của dự án visa; còn lại → điểm đến (intl chủ yếu).
      v.country = countryByProfile.get(p.id) ?? (primary?.dest ?? p.dest ?? undefined);
    }
    return m;
  }, [quotes, contracts, visaProjects, menus, itineraries, guideAssignments, profiles, quotesByProfile]);

  const metaOf = (id: string) => meta.get(id) ?? { primary: undefined, stage: 'request' as DealStage, links: { contract: 0, visa: 0, menu: 0, itinerary: 0 }, guide: 0, values: {} as ProfileValues, country: undefined };
  const primaryOf = (p: TourProfile): CloudQuoteEntry | undefined => metaOf(p.id).primary;

  const rows = useMemo(() => {
    let list = visible().slice();
    if (!showArchived) list = list.filter((p) => p.status !== 'archived');
    // ── Bộ lọc đa chiều: khách / loại / quốc gia / giai đoạn ──
    if (fltCustomer) list = list.filter((p) => (metaOf(p.id).primary?.customerName ?? p.customerName) === fltCustomer);
    if (fltCategory) list = list.filter((p) => tourCategoryOf(p) === fltCategory);
    if (fltCountry) list = list.filter((p) => (metaOf(p.id).country ?? '') === fltCountry);
    if (fltStage.length > 0) list = list.filter((p) => fltStage.includes(metaOf(p.id).stage));
    if (fltTag) list = list.filter((p) => (p.tags ?? []).includes(fltTag));

    // ── Sắp xếp: tìm-kiếm → theo độ khớp; ngược lại theo tiêu chí chọn ──
    if (search.trim()) {
      list = filterRank(list, search, (p) => [p.code, p.name, p.customerName].filter(Boolean).join(' '));
    } else {
      const dir = sortDir === 'asc' ? 1 : -1;
      const stageRank = (s: DealStage) => { const i = DEAL_STAGES.findIndex((x) => x.key === s); return i < 0 ? DEAL_STAGES.length : i; };
      list.sort((a, b) => {
        if ((a.status === 'archived') !== (b.status === 'archived')) return a.status === 'archived' ? 1 : -1;
        let r = 0;
        switch (sortBy) {
          case 'name': r = (a.name || a.code || '').localeCompare(b.name || b.code || '', 'vi'); break;
          case 'stage': r = stageRank(metaOf(a.id).stage) - stageRank(metaOf(b.id).stage); break;
          case 'value': r = (metaOf(a.id).values.current ?? -1) - (metaOf(b.id).values.current ?? -1); break;
          case 'depart': {
            const da = displayBasics(a, metaOf(a.id).primary).departDate || '';
            const db = displayBasics(b, metaOf(b.id).primary).departDate || '';
            if (!da !== !db) return da ? -1 : 1; // không có ngày → luôn xuống cuối
            r = da.localeCompare(db); break;
          }
          default: r = (a.createdAt || '').localeCompare(b.createdAt || ''); // 'created'
        }
        return r * dir;
      });
    }
    // Ghim lên đầu (stable — giữ thứ tự đã sắp ở trên).
    if (pinned.size > 0) list.sort((a, b) => (pinned.has(b.id) ? 1 : 0) - (pinned.has(a.id) ? 1 : 0));
    return list;
  }, [visible, profiles, search, showArchived, fltCustomer, fltCategory, fltCountry, fltStage, fltTag, sortBy, sortDir, pinned, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tùy chọn cho bộ lọc — suy từ các hồ sơ user được xem.
  const filterOptions = useMemo(() => {
    const all = visible();
    const customers = new Set<string>();
    const countries = new Set<string>();
    const tags = new Set<string>();
    for (const p of all) {
      const cn = metaOf(p.id).primary?.customerName ?? p.customerName;
      if (cn) customers.add(cn);
      const co = metaOf(p.id).country;
      if (co) countries.add(co);
      for (const t of p.tags ?? []) tags.add(t);
    }
    return { customers: [...customers].sort(), countries: [...countries].sort(), tags: [...tags].sort() };
  }, [visible, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilters = (fltCustomer ? 1 : 0) + (fltCategory ? 1 : 0) + (fltCountry ? 1 : 0) + (fltStage.length > 0 ? 1 : 0) + (fltTag ? 1 : 0);

  // ── Tổng quan điều hành (gom theo các hồ sơ đang hiển thị) ──
  const summary = useMemo(() => {
    const wonStages = new Set<DealStage>(['won', 'contract', 'operating', 'acceptance', 'closed']);
    let open = 0, archived = 0, won = 0, lost = 0, value = 0, remaining = 0, profit = 0, profitN = 0;
    const byStage: Record<string, number> = {};
    for (const p of rows) {
      if (p.status === 'archived') archived++; else open++;
      const mt = metaOf(p.id);
      byStage[mt.stage] = (byStage[mt.stage] ?? 0) + 1;
      if (mt.stage === 'lost') lost++; else if (wonStages.has(mt.stage)) won++;
      value += mt.primary?.totalCost ?? 0;
      remaining += mt.primary?.paymentSummary?.remaining ?? 0;
      const ap = mt.primary?.settlementSummary?.actualProfit;
      if (typeof ap === 'number') { profit += ap; profitN++; }
    }
    const decided = won + lost;
    const margin = marginSummary(rows.map((p) => metaOf(p.id).primary?.settlementSummary));
    return { total: rows.length, open, archived, won, lost, byStage, value, remaining, profit, profitN, margin, winRate: decided ? Math.round((won / decided) * 100) : null };
  }, [rows, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Yêu cầu xuất của TÔI (nếu đang chờ/được duyệt) + các yêu cầu đang chờ duyệt.
  const myExportReq = useMemo(
    () => exportRequests.find((r) => r.scope === 'tour_profiles' && r.requestedByU === currentUser?.u),
    [exportRequests, currentUser],
  );
  const pendingExports = useMemo(
    () => exportRequests.filter((r) => r.status === 'pending' && r.scope === 'tour_profiles'),
    [exportRequests],
  );

  // Sinh & tải file Excel thật từ tập hồ sơ ĐÃ LỌC (qua hộp thoại tuỳ chọn xuất).
  const runExport = async (srcRows: TourProfile[], summary: string) => {
    setExporting(true);
    try {
      const data: TourProfileExportRow[] = srcRows.map((p) => {
        const mt = metaOf(p.id);
        const pr = mt.primary;
        const v = mt.values;
        const b = displayBasics(p, pr);
        return {
          code: p.code,
          name: p.name || '(chưa đặt tên)',
          category: categoryMeta(tourCategoryOf(p)).short,
          customer: b.custName ?? '',
          departDate: b.departDate ? new Date(b.departDate).toLocaleDateString('vi-VN') : '',
          pax: b.pax ?? 0,
          stage: STAGE_META(mt.stage).short,
          quotes: (quotesByProfile.get(p.id) ?? []).length,
          contracts: mt.links.contract, visa: mt.links.visa, menus: mt.links.menu, itineraries: mt.links.itinerary, guide: mt.guide,
          valueCurrent: typeof v.current === 'number' ? v.current : '',
          valueContract: typeof v.contract === 'number' ? v.contract : '',
          valueSettlement: typeof v.settlement === 'number' ? v.settlement : '',
          payableRemaining: pr?.paymentSummary?.remaining ?? 0,
          actualProfit: typeof pr?.settlementSummary?.actualProfit === 'number' ? pr.settlementSummary.actualProfit : '',
          owner: p.createdBy ?? '',
          status: p.status === 'archived' ? 'Lưu trữ' : 'Đang mở',
        };
      });
      await exportTourProfilesExcel(data, { filterSummary: summary, generatedBy: currentUser?.name });
    } catch (e) {
      window.alert('❌ Xuất Excel lỗi: ' + (e as Error).message);
    } finally { setExporting(false); }
  };

  // Cổng duyệt xuất Excel: BAN GIÁM ĐỐC trở lên tải thẳng; dưới quyền phải được duyệt.
  const proceedExport = async (srcRows: TourProfile[], summary: string) => {
    if (srcRows.length === 0) { window.alert('Không có hồ sơ nào khớp điều kiện xuất.'); return; }
    setExportOpen(false);
    if (isExportApprover) { await runExport(srcRows, summary); return; }
    // Đã được duyệt → tải về rồi tiêu thụ (xoá) yêu cầu.
    if (myExportReq?.status === 'approved') {
      await runExport(srcRows, summary);
      try { await removeExport(myExportReq.id); } catch { /* dọn sau cũng được */ }
      return;
    }
    if (myExportReq?.status === 'pending') {
      window.alert('⏳ Yêu cầu xuất Excel của bạn đang chờ Ban Giám Đốc duyệt.');
      return;
    }
    if (myExportReq?.status === 'rejected') {
      if (!window.confirm(`Yêu cầu trước đã bị từ chối${myExportReq.rejectReason ? ` (lý do: ${myExportReq.rejectReason})` : ''}.\nGửi lại yêu cầu xuất Excel?`)) return;
      try { await removeExport(myExportReq.id); } catch { /* bỏ qua */ }
    }
    // Gửi yêu cầu mới + thông báo cho người duyệt (Ban Giám Đốc trở lên).
    if (!currentUser) return;
    try {
      const detail = summary || `${srcRows.length} hồ sơ tour`;
      await requestExport('tour_profiles', detail);
      const approverUsernames = users.filter((u) => isBoard(u.role)).map((u) => u.u);
      if (approverUsernames.length > 0) {
        await sbSendNotificationMany(approverUsernames, {
          type: 'export_approval',
          title: 'Yêu cầu duyệt XUẤT Excel hồ sơ tour',
          message: `${currentUser.name} xin xuất ${detail} ra Excel. Vào tab “Hồ sơ tour” để duyệt.`,
          createdBy: currentUser.name,
          priority: 'high',
        });
      }
      window.alert('✅ Đã gửi yêu cầu xuất Excel. Chờ Ban Giám Đốc duyệt — bạn sẽ nhận thông báo khi được duyệt.');
    } catch (e) {
      window.alert('❌ Gửi yêu cầu xuất lỗi: ' + (e as Error).message);
    }
  };

  // Lọc tập hồ sơ để XUẤT theo khoảng ngày khởi hành + phân loại (trên danh sách đang hiển thị).
  const filterExportRows = (f: ExportFilters): TourProfile[] =>
    rows.filter((p) => {
      const dd = displayBasics(p, metaOf(p.id).primary).departDate || '';
      if (f.from && (!dd || dd < f.from)) return false;
      if (f.to && (!dd || dd > f.to)) return false;
      if (f.categories.length > 0 && !f.categories.includes(tourCategoryOf(p))) return false;
      return true;
    });

  const onApproveExport = async (id: string) => {
    try { await approveExport(id); } catch (e) { window.alert('❌ ' + (e as Error).message); }
  };
  const onRejectExport = async (id: string) => {
    const reason = window.prompt('Lý do từ chối (tuỳ chọn):') ?? '';
    try { await rejectExport(id, reason.trim()); } catch (e) { window.alert('❌ ' + (e as Error).message); }
  };

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (currentUser) { try { localStorage.setItem(prefsKey(currentUser.u), JSON.stringify([...next])); } catch { /* ignore */ } }
      return next;
    });
  };

  const toggleDensity = () => {
    setDensity((prev) => {
      const next = prev === 'compact' ? 'comfortable' : 'compact';
      if (currentUser) { try { localStorage.setItem(densityKey(currentUser.u), next); } catch { /* ignore */ } }
      return next;
    });
  };

  const toggleLayout = () => {
    setLayout((prev) => {
      const next = prev === 'table' ? 'card' : 'table';
      if (currentUser) { try { localStorage.setItem(layoutKey(currentUser.u), next); } catch { /* ignore */ } }
      return next;
    });
  };

  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (currentUser) { try { localStorage.setItem(pinsKey(currentUser.u), JSON.stringify([...next])); } catch { /* ignore */ } }
      return next;
    });
  };

  // ── Bộ lọc lưu sẵn (Saved views) ──
  const persistViews = (v: SavedView[]) => { setSavedViews(v); if (currentUser) saveViews(currentUser.u, v); };
  const applyView = (v: SavedView) => {
    setSearch(v.search); setFltCustomer(v.customer); setFltCategory(v.category);
    setFltCountry(v.country); setFltStage(v.stages); setFltTag(v.tag);
  };
  const saveCurrentView = () => {
    const name = window.prompt('Tên bộ lọc (vd "Tour tháng này", "Đang vận hành"):')?.trim();
    if (!name) return;
    const v: SavedView = { name, search, customer: fltCustomer, category: fltCategory, country: fltCountry, stages: fltStage, tag: fltTag };
    persistViews([...savedViews.filter((x) => x.name !== name), v]);
  };
  const deleteView = (name: string) => persistViews(savedViews.filter((x) => x.name !== name));

  // ── Chọn nhiều (chế độ Bảng) ──
  const toggleSelect = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSelection = () => setSelected(new Set());
  const bulkArchiveSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`Lưu trữ ${ids.length} hồ sơ đã chọn?`)) return;
    try { await Promise.all(ids.map((id) => archive(id, true))); clearSelection(); }
    catch (e) { window.alert('❌ ' + (e as Error).message); }
  };
  const bulkExportSelected = () => {
    const src = rows.filter((p) => selected.has(p.id));
    if (src.length === 0) return;
    void proceedExport(src, `${src.length} hồ sơ đã chọn`);
  };

  const openQuote = async (cloudId: string, keepView: boolean) => {
    if (currentQuoteId && currentQuoteId !== cloudId &&
        !window.confirm('Mở báo giá này? Thay đổi cục bộ chưa lưu có thể mất.')) return false;
    const r = await loadCloud(cloudId, { keepView });
    if (!r.ok) { window.alert('⚠ ' + r.error); return false; }
    return true;
  };

  const openProfile = async (p: TourProfile) => {
    const pq = primaryOf(p);
    if (!pq) { window.alert('Hồ sơ chưa có báo giá nào để mở.'); return; }
    if (await openQuote(pq.cloudId, true)) setDetailId(p.id);
  };

  // Nhân bản tour mẫu: lấy báo giá ĐANG MỞ làm bản sao MỚI (chưa lưu) → khi Lưu sẽ
  // sinh báo giá + hồ sơ tour mới (saveCloud tự tạo vì currentQuoteId=null). Tái dùng
  // toàn bộ luồng có sẵn; chỉ "tẩy" danh tính của draft + đổi tên.
  const cloneCurrent = () => {
    const draft = useQuoteStore.getState().draft;
    if (!draft.currentQuoteId) { window.alert('Chưa có báo giá đang mở để nhân bản.'); return; }
    if (!window.confirm('Nhân bản báo giá đang mở thành BÁO GIÁ + HỒ SƠ TOUR MỚI?\nBản sao sẽ mở ở màn báo giá để bạn kiểm tra rồi bấm Lưu (chưa tạo gì cho tới khi Lưu).')) return;
    useQuoteStore.setState((s) => ({
      draft: {
        ...s.draft,
        currentQuoteId: null,      // → saveCloud coi là báo giá MỚI
        tourProfileId: undefined,  // → tự tạo hồ sơ tour MỚI khi lưu
        tourCode: undefined,
        status: 'in_progress',     // reset trạng thái pipeline
        info: { ...s.draft.info, name: clonedQuoteName(s.draft.info.name) },
      },
    }));
    setDetailId(null);
    useQuoteStore.getState().setView('cost'); // rời tab Hồ sơ tour → màn báo giá để kiểm tra & Lưu
  };

  // Xuất hồ sơ ra PDF 1 trang (gửi/in nội bộ). Nạp động exportTourProfilePDF.
  const exportProfilePDF = (p: TourProfile) => {
    const mt = metaOf(p.id);
    const b = displayBasics(p, mt.primary);
    const data: TourProfilePdfData = {
      code: p.code,
      name: p.name || '(chưa đặt tên)',
      category: categoryMeta(tourCategoryOf(p)).label,
      customer: b.custName ?? '',
      departDate: b.departDate ? new Date(b.departDate).toLocaleDateString('vi-VN') : '',
      pax: b.pax ?? 0,
      stage: STAGE_META(mt.stage).short,
      owner: p.createdBy ?? '',
      collaborators: (p.collaborators ?? []).map((c) => c.name),
      followers: (p.followers ?? []).map((c) => c.name),
      eventStaff: (p.eventStaff ?? []).map((c) => c.name),
      documents: (p.documents ?? []).length,
      showPrice,
      values: mt.values,
      links: { quotes: (quotesByProfile.get(p.id) ?? []).length, contract: mt.links.contract, visa: mt.links.visa, menu: mt.links.menu, itinerary: mt.links.itinerary, guide: mt.guide },
      risks: tourProfileRisks({ primary: mt.primary, stage: mt.stage, contractCount: mt.links.contract }).map((r) => r.label),
      milestones: tourProfileMilestones({ primary: mt.primary, stage: mt.stage })
        .map((m) => ({ label: m.label, date: new Date(m.date).toLocaleDateString('vi-VN'), status: countdownLabel(m) })),
    };
    void import('@/lib/exports/exportTourProfilePDF')
      .then((m) => m.exportTourProfilePDF(data))
      .catch((e) => window.alert('❌ Xuất PDF lỗi: ' + (e as Error).message));
  };

  // Cổng đóng hồ sơ thông minh: khi lưu trữ deal đã thắng mà checklist còn thiếu → hỏi lại.
  const handleArchive = (p: TourProfile, on: boolean) => {
    if (!on) { void archive(p.id, false); return; } // mở lại → trực tiếp
    const mt = metaOf(p.id);
    const items = tourProfileClosingChecklist({ primary: mt.primary, stage: mt.stage, contractCount: mt.links.contract });
    if (closingPending(items).length === 0) { void archive(p.id, true); return; } // đủ điều kiện → đóng luôn
    setCloseState({ profile: p, items });
  };

  // Deep-link từ Global Search / Trợ lý: mở đúng hồ sơ khi vào tab.
  const consumeFocus = useTourProfileStore((s) => s.consumeFocus);
  useEffect(() => {
    const fid = consumeFocus();
    if (!fid) return;
    const p = profiles.find((x) => x.id === fid);
    if (!p) return;
    if (primaryOf(p)) void openProfile(p);
    else setExpanded((prev) => new Set(prev).add(fid)); // hồ sơ trống → mở rộng trong danh sách
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Detail: Bảng điều hành (DealCockpit) của báo giá chính, kèm thanh hồ sơ ──
  if (detailId) {
    const p = profiles.find((x) => x.id === detailId);
    const opts = p ? (quotesByProfile.get(p.id) ?? []) : [];
    const canEdit = p ? canShareRecord(currentUser, p, users) : false;
    return (
      <Box sx={{ p: { xs: 1, sm: 2 }, maxWidth: 1100, mx: 'auto' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => setDetailId(null)}>Danh sách hồ sơ</Button>
          {p && <Chip size="small" label={p.code} sx={{ fontWeight: 800, bgcolor: 'rgba(13,122,106,0.12)', color: '#0d7a6a' }} />}
          {p && (
            <Tooltip title="Nhân bản thành báo giá + hồ sơ tour mới (tour mẫu lặp lại)">
              <Button size="small" startIcon={<ContentCopyIcon sx={{ fontSize: 16 }} />} onClick={cloneCurrent}>Nhân bản</Button>
            </Tooltip>
          )}
          {p && (
            <Tooltip title="Xuất hồ sơ ra PDF 1 trang (gửi/in nội bộ)">
              <Button size="small" startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />} onClick={() => exportProfilePDF(p)}>Xuất PDF</Button>
            </Tooltip>
          )}
          {p && canEdit && (
            <Tooltip title="Sửa thông tin cơ bản (tên / khách / ngày / số khách)">
              <Button size="small" startIcon={<EditOutlinedIcon sx={{ fontSize: 16 }} />} onClick={() => setEditId(p.id)}>Sửa thông tin</Button>
            </Tooltip>
          )}
          {opts.length > 1 && (
            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="caption" color="text.secondary">Phương án:</Typography>
              {opts.map((q) => {
                const isPrimary = q.cloudId === p?.primaryQuoteId;
                return (
                  <Chip key={q.cloudId} size="small" clickable
                    variant={currentQuoteId === q.cloudId ? 'filled' : 'outlined'}
                    color={currentQuoteId === q.cloudId ? 'primary' : 'default'}
                    icon={isPrimary ? <StarIcon sx={{ fontSize: 15 }} /> : undefined}
                    label={q.name}
                    onClick={() => void openQuote(q.cloudId, true)}
                    // Icon sao bên phải (onDelete) = đặt làm báo giá chính.
                    onDelete={canEdit && !isPrimary && p ? () => void setPrimaryQuote(p.id, q.cloudId) : undefined}
                    deleteIcon={<Tooltip title="Đặt làm báo giá chính"><StarBorderIcon sx={{ fontSize: 16 }} /></Tooltip>}
                  />
                );
              })}
            </Stack>
          )}
        </Stack>
        <Tabs value={detailTab} onChange={(_, v: number) => setDetailTab(v)} variant="scrollable" scrollButtons="auto"
          sx={{ minHeight: 36, mb: 1.5, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontWeight: 700 } }}>
          <Tab label="Tổng quan" />
          <Tab label="Hồ sơ & liên kết" />
          <Tab label="Trao đổi & lịch sử" />
        </Tabs>

        {/* Tab 0 — Tổng quan: cảnh báo + mốc + bảng điều hành + so sánh phương án */}
        <Box hidden={detailTab !== 0}>
          {p && (() => {
            const mt = metaOf(p.id);
            const risks = tourProfileRisks({ primary: mt.primary, stage: mt.stage, contractCount: mt.links.contract });
            const milestones = tourProfileMilestones({ primary: mt.primary, stage: mt.stage });
            return (
              <>
                {risks.length > 0 && <RiskPanel risks={risks} />}
                <MarginGuardPanel profile={p} />
                <MilestonePanel milestones={milestones} />
              </>
            );
          })()}
          <DealCockpit />
          {p && opts.length > 1 && (
            <CompareOptionsPanel
              options={opts}
              primaryId={p.primaryQuoteId}
              currentId={currentQuoteId ?? undefined}
              showPrice={showPrice}
              onOpen={(cid) => void openQuote(cid, true)}
            />
          )}
        </Box>

        {/* Tab 1 — Hồ sơ & liên kết: nhãn + liên kết + tài liệu + khách hàng 360 */}
        {p && detailTab === 1 && (
          <>
            <TagEditor profile={p} canEdit={canEdit} />
            <DirectLinkPanel profile={p} />
            <DocumentHub profile={p} canEdit={canEdit} />
            {(() => {
              const custName = metaOf(p.id).primary?.customerName ?? p.customerName ?? '';
              if (!custName) return null;
              const portRows: ProfilePortfolioRow[] = visible().map((x) => {
                const m = metaOf(x.id);
                return { id: x.id, code: x.code, name: x.name, customerName: m.primary?.customerName ?? x.customerName, stage: m.stage, value: m.values.current, profit: m.primary?.settlementSummary?.actualProfit };
              });
              return (
                <CustomerPortfolioPanel
                  portfolio={customerPortfolio(portRows, custName)}
                  currentId={p.id}
                  showPrice={showPrice}
                  onOpen={(id) => { const tp = profiles.find((x) => x.id === id); if (tp) void openProfile(tp); }}
                />
              );
            })()}
          </>
        )}

        {/* Tab 2 — Trao đổi & lịch sử */}
        {p && detailTab === 2 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <ProfileDiscussion profile={p} users={users} currentUser={currentUser} />
            <ProfileTimeline profile={p} />
          </Box>
        )}

        {p && editId === p.id && (
          <EditBasicInfoDialog
            profile={p}
            primary={metaOf(p.id).primary}
            onClose={() => setEditId(null)}
            onSave={async (info, lock) => { await setBasicInfo(p.id, info, lock); setEditId(null); }}
          />
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
            <Typography fontWeight={900} fontSize={16}>🧭 Hồ sơ tour</Typography>
            <Chip size="small" label={`${summary.total} hồ sơ`} sx={{ height: 20, fontWeight: 800, bgcolor: 'rgba(13,122,106,0.12)', color: '#0d7a6a' }} />
            {summary.open > 0 && <Chip size="small" label={`${summary.open} đang mở`} sx={{ height: 20, fontWeight: 700, bgcolor: 'rgba(37,99,235,0.1)', color: '#2563eb' }} />}
            {summary.won > 0 && <Chip size="small" label={`${summary.won} đã chốt`} sx={{ height: 20, fontWeight: 700, bgcolor: 'rgba(22,163,74,0.12)', color: '#16a34a' }} />}
            {summary.archived > 0 && <Chip size="small" label={`${summary.archived} lưu trữ`} sx={{ height: 20, fontWeight: 700, bgcolor: 'rgba(100,116,139,0.14)', color: '#475569' }} />}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Trung tâm liên kết báo giá / khách / hợp đồng / vận hành / visa…
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <FormControlLabel
            control={<Switch size="small" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />}
            label={<Typography variant="caption">Hiện lưu trữ</Typography>}
            sx={{ mr: 0 }}
          />
          <TextField size="small" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Tìm mã, tên tour, khách…" sx={{ minWidth: 220 }} />
          <Tooltip title="Bộ lọc">
            <IconButton size="small" color={showFilters || activeFilters ? 'primary' : 'default'} onClick={() => setShowFilters((v) => !v)}>
              <FilterListIcon />
            </IconButton>
          </Tooltip>
          <TextField select size="small" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}
            SelectProps={{ native: true }} sx={{ minWidth: 120 }} aria-label="Sắp xếp">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </TextField>
          <Tooltip title={sortDir === 'desc' ? 'Giảm dần' : 'Tăng dần'}>
            <IconButton size="small" onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}>
              <SwapVertIcon sx={{ transform: sortDir === 'asc' ? 'scaleY(-1)' : 'none' }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={layout === 'table' ? 'Xem dạng thẻ' : 'Xem dạng bảng'}>
            <IconButton size="small" color={layout === 'table' ? 'primary' : 'default'} onClick={toggleLayout}>
              {layout === 'table' ? <ViewAgendaOutlinedIcon /> : <TableRowsIcon />}
            </IconButton>
          </Tooltip>
          {layout === 'card' && (
            <Tooltip title={density === 'compact' ? 'Xem đầy đủ' : 'Xem rút gọn'}>
              <IconButton size="small" color={density === 'compact' ? 'primary' : 'default'} onClick={toggleDensity}>
                {density === 'compact' ? <DensityLargeIcon /> : <DensitySmallIcon />}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Lịch khởi hành">
            <IconButton size="small" color={showCalendar ? 'primary' : 'default'} onClick={() => setShowCalendar((v) => !v)}><CalendarMonthIcon /></IconButton>
          </Tooltip>
          <Tooltip title="Tổng quan điều hành">
            <IconButton size="small" color={showDash ? 'primary' : 'default'} onClick={() => setShowDash((v) => !v)}><BarChartIcon /></IconButton>
          </Tooltip>
          <Tooltip title={
            isExportApprover ? 'Xuất Excel danh sách hồ sơ'
              : myExportReq?.status === 'approved' ? 'Đã được duyệt — tải Excel'
              : myExportReq?.status === 'pending' ? 'Đang chờ Ban Giám Đốc duyệt'
              : 'Xuất Excel (cần Ban Giám Đốc duyệt)'
          }>
            <span>
              <IconButton
                size="small"
                color={!isExportApprover && myExportReq?.status === 'approved' ? 'success' : !isExportApprover && myExportReq?.status === 'pending' ? 'warning' : 'default'}
                disabled={exporting || rows.length === 0}
                onClick={() => setExportOpen(true)}
              >
                {!isExportApprover && myExportReq?.status === 'pending' ? <HourglassEmptyIcon /> : <FileDownloadOutlinedIcon />}
              </IconButton>
            </span>
          </Tooltip>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            Hồ sơ trống
          </Button>
        </Stack>
      </Stack>

      <ExportApprovalBanner
        isApprover={isExportApprover}
        pending={pendingExports}
        myRequest={isExportApprover ? undefined : myExportReq}
        onApprove={(id) => void onApproveExport(id)}
        onReject={(id) => void onRejectExport(id)}
        onDownload={() => setExportOpen(true)}
        onDismiss={(id) => void removeExport(id)}
      />

      {(savedViews.length > 0 || activeFilters > 0 || search.trim()) && (
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          <BookmarkBorderIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>Bộ lọc lưu:</Typography>
          {savedViews.length === 0 && <Typography variant="caption" color="text.disabled">(chưa có)</Typography>}
          {savedViews.map((v) => (
            <Chip key={v.name} size="small" label={v.name} onClick={() => applyView(v)} onDelete={() => deleteView(v.name)}
              sx={{ height: 22, fontWeight: 600, bgcolor: 'rgba(13,122,106,0.08)', color: '#0d7a6a', cursor: 'pointer' }} />
          ))}
          {(activeFilters > 0 || search.trim()) && (
            <Button size="small" startIcon={<BookmarkAddOutlinedIcon sx={{ fontSize: 16 }} />} onClick={saveCurrentView}>Lưu bộ lọc hiện tại</Button>
          )}
        </Stack>
      )}

      {!showFilters && activeFilters > 0 && (
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>Đang lọc:</Typography>
          {fltCustomer && <Chip size="small" label={`Khách: ${fltCustomer}`} onDelete={() => setFltCustomer('')} sx={{ height: 22 }} />}
          {fltCategory && <Chip size="small" label={categoryMeta(fltCategory).short} onDelete={() => setFltCategory('')} sx={{ height: 22 }} />}
          {fltCountry && <Chip size="small" label={fltCountry} onDelete={() => setFltCountry('')} sx={{ height: 22 }} />}
          {fltStage.map((s) => {
            const sm = STAGE_META(s);
            return <Chip key={s} size="small" label={sm.short} onDelete={() => setFltStage(fltStage.filter((x) => x !== s))}
              sx={{ height: 22, bgcolor: `${sm.color}1a`, color: sm.color, fontWeight: 700 }} />;
          })}
          {fltTag && <Chip size="small" label={`# ${fltTag}`} onDelete={() => setFltTag('')} sx={{ height: 22 }} />}
          <Button size="small" onClick={() => { setFltCustomer(''); setFltCategory(''); setFltCountry(''); setFltStage([]); setFltTag(''); }}>Xoá tất cả</Button>
        </Stack>
      )}

      <Collapse in={showFilters} unmountOnExit>
        <FilterPanel
          customers={filterOptions.customers}
          countries={filterOptions.countries}
          tags={filterOptions.tags}
          fltCustomer={fltCustomer} setFltCustomer={setFltCustomer}
          fltCategory={fltCategory} setFltCategory={setFltCategory}
          fltCountry={fltCountry} setFltCountry={setFltCountry}
          fltStage={fltStage} setFltStage={setFltStage}
          fltTag={fltTag} setFltTag={setFltTag}
          onClear={() => { setFltCustomer(''); setFltCategory(''); setFltCountry(''); setFltStage([]); setFltTag(''); }}
          activeFilters={activeFilters}
        />
      </Collapse>

      {showDash && <DashboardPanel summary={summary} showPrice={showPrice} />}

      {showCalendar ? (
        <DepartureCalendar
          rows={rows.map((p) => { const mt = metaOf(p.id); return { id: p.id, code: p.code, name: p.name, stage: mt.stage, departDate: mt.primary?.departDate ?? p.startDate }; })}
          onOpen={(id) => { const tp = profiles.find((x) => x.id === id); if (tp) void openProfile(tp); }}
        />
      ) : rows.length === 0 ? (
        (activeFilters > 0 || search.trim()) ? (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
            <FilterListIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography fontWeight={700} sx={{ mb: 0.5 }}>Không có hồ sơ khớp điều kiện</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Thử nới bộ lọc hoặc xoá từ khoá tìm kiếm.
            </Typography>
            <Button size="small" variant="outlined" onClick={() => { setSearch(''); setFltCustomer(''); setFltCategory(''); setFltCountry(''); setFltStage([]); setFltTag(''); }}>
              Xoá bộ lọc &amp; tìm kiếm
            </Button>
          </Paper>
        ) : (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}>
            <FolderOpenOutlinedIcon sx={{ fontSize: 44, color: '#0d7a6a', opacity: 0.7, mb: 1 }} />
            <Typography fontWeight={800} sx={{ mb: 0.5 }}>Chưa có hồ sơ tour nào</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460, mx: 'auto', mb: 1.5 }}>
              Bấm <strong>＋ Tạo báo giá và tour mới</strong> để mở hồ sơ đầu tiên, hoặc <strong>Hồ sơ trống</strong> để mở một tour chưa có báo giá.
            </Typography>
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)} sx={{ background: LEGACY.headerGradient }}>
              Hồ sơ trống
            </Button>
          </Paper>
        )
      ) : layout === 'table' ? (
        <>
          {selected.size > 0 && (
            <Paper variant="outlined" sx={{ p: 1, mb: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', bgcolor: 'rgba(13,122,106,0.06)', borderColor: 'rgba(13,122,106,0.3)' }}>
              <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>Đã chọn {selected.size} hồ sơ</Typography>
              {showPrice && <Button size="small" startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />} onClick={bulkExportSelected}>Xuất Excel</Button>}
              <Button size="small" startIcon={<ArchiveOutlinedIcon sx={{ fontSize: 16 }} />} onClick={() => void bulkArchiveSelected()}>Lưu trữ</Button>
              <Button size="small" onClick={clearSelection}>Bỏ chọn</Button>
            </Paper>
          )}
          <ProfileTable
            rows={rows} metaOf={metaOf} quotesByProfile={quotesByProfile} showPrice={showPrice}
            pinned={pinned} selected={selected}
            onToggleSelect={toggleSelect}
            onToggleAll={(on) => setSelected(on ? new Set(rows.map((p) => p.id)) : new Set())}
            onTogglePin={togglePin}
            onQuickView={(id) => setQuickId(id)}
            onOpenProfile={(p) => void openProfile(p)}
          />
        </>
      ) : (
        <Stack spacing={1.25}>
          {rows.map((p) => {
            const mt = metaOf(p.id);
            return (
              <ProfileRow
                key={p.id}
                profile={p}
                stage={mt.stage}
                primary={mt.primary}
                guideCount={mt.guide}
                quotes={quotesByProfile.get(p.id) ?? []}
                links={mt.links}
                values={mt.values}
                risks={tourProfileRisks({ primary: mt.primary, stage: mt.stage, contractCount: mt.links.contract })}
                expanded={expanded.has(p.id)}
                compact={density === 'compact'}
                pinned={pinned.has(p.id)}
                showPrice={showPrice}
                currentUser={currentUser}
                users={users}
                onToggle={() => toggle(p.id)}
                onTogglePin={() => togglePin(p.id)}
                onEdit={() => setEditId(p.id)}
                onQuickView={() => setQuickId(p.id)}
                onOpenProfile={() => void openProfile(p)}
                onOpenQuote={(cid) => void openQuote(cid, false)}
                onSetPrimary={(cid) => void setPrimaryQuote(p.id, cid)}
                onArchive={(on) => handleArchive(p, on)}
                onDelete={() => (deleteNeedsApproval(currentUser) ? setRequestDeleteState(p) : setDeleteState(p))}
                onMoveQuote={(cid, qname) => setMoveState({ cloudId: cid, fromProfileId: p.id, quoteName: qname })}
                onApproveDelete={() => void approveDelete(p.id)}
                onRejectDelete={() => void rejectDelete(p.id)}
              />
            );
          })}
        </Stack>
      )}

      <ExportOptionsDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        filterRows={filterExportRows}
        isApprover={isExportApprover}
        myRequest={isExportApprover ? undefined : myExportReq}
        busy={exporting}
        onSubmit={(srcRows, summary) => void proceedExport(srcRows, summary)}
      />

      <CreateEmptyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (category, name) => {
          const created = await createProfile({ kind: categoryKind(category), category, name });
          setCreateOpen(false);
          if (created) setExpanded((prev) => new Set(prev).add(created.id));
        }}
      />

      <MoveQuoteDialog
        state={moveState}
        options={rows.filter((p) => p.id !== moveState?.fromProfileId && p.status !== 'archived')}
        onClose={() => setMoveState(null)}
        onMove={async (toId) => {
          if (moveState) await moveQuote(moveState.cloudId, moveState.fromProfileId, toId);
          setMoveState(null);
        }}
      />

      <DeleteProfileDialog
        profile={deleteState}
        quoteCount={deleteState ? (quotesByProfile.get(deleteState.id) ?? []).length : 0}
        linkCount={deleteState ? (() => { const l = metaOf(deleteState.id).links; return l.contract + l.visa + l.menu + l.itinerary; })() : 0}
        onClose={() => setDeleteState(null)}
        onDelete={async () => {
          if (deleteState) await removeProfile(deleteState.id);
          setDeleteState(null);
        }}
      />

      <RequestDeleteDialog
        profile={requestDeleteState}
        users={users}
        currentUser={currentUser}
        onClose={() => setRequestDeleteState(null)}
        onRequest={async (approver, reason) => {
          if (requestDeleteState && currentUser) {
            const req: DeleteRequest = {
              byU: currentUser.u, byName: currentUser.name,
              approverU: approver.u, approverName: approver.name,
              reason: reason.trim() || undefined,
              requestedAt: new Date().toISOString(),
            };
            await requestDelete(requestDeleteState.id, req);
            try {
              await sbSendNotification(approver.u, {
                type: 'delete_approval',
                title: `Yêu cầu duyệt XOÁ hồ sơ tour ${requestDeleteState.code}`,
                message: `${currentUser.name} xin xoá hồ sơ "${requestDeleteState.name || requestDeleteState.code}".${req.reason ? ' Lý do: ' + req.reason : ''}`,
                createdBy: currentUser.name,
                priority: 'high',
                link: { kind: 'tourProfile', id: requestDeleteState.id, label: requestDeleteState.code },
              });
            } catch { /* thông báo không chặn */ }
          }
          setRequestDeleteState(null);
        }}
      />

      <ClosingChecklistDialog
        state={closeState}
        onClose={() => setCloseState(null)}
        onArchiveAnyway={async () => {
          if (closeState) await archive(closeState.profile.id, true);
          setCloseState(null);
        }}
      />

      {(() => {
        const ep = editId ? profiles.find((x) => x.id === editId) : null;
        if (!ep) return null;
        return (
          <EditBasicInfoDialog
            profile={ep}
            primary={metaOf(ep.id).primary}
            onClose={() => setEditId(null)}
            onSave={async (info, lock) => { await setBasicInfo(ep.id, info, lock); setEditId(null); }}
          />
        );
      })()}

      {(() => {
        const qp = quickId ? profiles.find((x) => x.id === quickId) : null;
        if (!qp) return null;
        const mt = metaOf(qp.id);
        return (
          <QuickViewDialog
            profile={qp}
            meta={mt}
            quoteCount={(quotesByProfile.get(qp.id) ?? []).length}
            showPrice={showPrice}
            onClose={() => setQuickId(null)}
            onOpen={() => { setQuickId(null); void openProfile(qp); }}
          />
        );
      })()}
    </Box>
  );
}

/** dd/mm/yyyy từ chuỗi ISO yyyy-mm-dd (cho tóm tắt điều kiện xuất). */
const fmtDMY = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

/**
 * Hộp thoại TUỲ CHỌN XUẤT EXCEL chuyên nghiệp: chọn khoảng ngày khởi hành + phân loại
 * hồ sơ; xem trước số hồ sơ khớp; nút hành động đổi theo cổng duyệt (BGĐ tải thẳng,
 * dưới quyền gửi yêu cầu / tải khi đã duyệt).
 */
function ExportOptionsDialog({ open, onClose, filterRows, isApprover, myRequest, busy, onSubmit }: {
  open: boolean;
  onClose: () => void;
  filterRows: (f: ExportFilters) => TourProfile[];
  isApprover: boolean;
  myRequest?: ExportRequest;
  busy: boolean;
  onSubmit: (rows: TourProfile[], summary: string) => void;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [categories, setCategories] = useState<TourCategory[]>([]);
  useEffect(() => { if (open) { setFrom(''); setTo(''); setCategories([]); } }, [open]);

  const filtered = open ? filterRows({ from, to, categories }) : [];
  const count = filtered.length;
  const summary = (() => {
    const parts: string[] = [`${count} hồ sơ`];
    if (categories.length > 0) parts.push(categories.map((c) => categoryMeta(c).short).join(', '));
    if (from || to) parts.push(`KH ${from ? fmtDMY(from) : '…'}–${to ? fmtDMY(to) : '…'}`);
    return parts.join(' · ');
  })();

  // Nhãn + trạng thái nút hành động theo cổng duyệt.
  const approved = !isApprover && myRequest?.status === 'approved';
  const pending = !isApprover && myRequest?.status === 'pending';
  const actionLabel = isApprover ? 'Xuất Excel' : approved ? 'Tải Excel' : pending ? 'Đang chờ duyệt' : 'Gửi yêu cầu duyệt';

  const toggleCat = (c: TourCategory) =>
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <FileDownloadOutlinedIcon sx={{ color: '#0d7a6a' }} />
          <Box sx={{ flex: 1 }}>Xuất Excel hồ sơ tour</Box>
          <Chip size="small"
            icon={<LockOutlinedIcon sx={{ fontSize: 14 }} />}
            label={isApprover ? 'BGĐ — tải thẳng' : 'Cần BGĐ duyệt'}
            sx={{ height: 22, fontWeight: 700,
              bgcolor: isApprover ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)',
              color: isApprover ? '#16a34a' : '#d97706',
              '& .MuiChip-icon': { color: 'inherit' } }} />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Box>
            <Stack direction="row" spacing={0.6} alignItems="center" sx={{ mb: 0.75 }}>
              <CalendarMonthIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
              <Typography variant="caption" fontWeight={800} color="text.secondary">Ngày khởi hành (tuỳ chọn)</Typography>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField size="small" label="Từ ngày" type="date" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
              <TextField size="small" label="Đến ngày" type="date" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            </Stack>
          </Box>
          <Box>
            <Stack direction="row" spacing={0.6} alignItems="center" sx={{ mb: 0.75 }}>
              <FilterListIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
              <Typography variant="caption" fontWeight={800} color="text.secondary">Phân loại (trống = tất cả)</Typography>
            </Stack>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {TOUR_CATEGORIES.map((c) => {
                const on = categories.includes(c.key);
                return (
                  <Chip
                    key={c.key} label={`${c.icon} ${c.short}`} onClick={() => toggleCat(c.key)}
                    variant={on ? 'filled' : 'outlined'}
                    sx={{ fontWeight: 700, ...(on ? { bgcolor: `${c.color}1f`, color: c.color, borderColor: c.color } : { borderColor: 'rgba(0,0,0,0.18)' }) }}
                  />
                );
              })}
            </Stack>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center"
            sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'rgba(13,122,106,0.06)', border: '1px solid rgba(13,122,106,0.18)' }}>
            <Box sx={{ textAlign: 'center', minWidth: 56 }}>
              <Typography fontSize={22} fontWeight={900} sx={{ color: '#0d7a6a', lineHeight: 1 }}>{count}</Typography>
              <Typography variant="caption" color="text.secondary">hồ sơ</Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" fontWeight={700} sx={{ mb: 0.25 }}>Sẽ xuất ra Excel</Typography>
              <Typography variant="caption" color="text.secondary">{summary}</Typography>
            </Box>
          </Stack>
          {!isApprover && !approved && !pending && (
            <Stack direction="row" spacing={1} alignItems="center"
              sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.22)' }}>
              <LockOutlinedIcon sx={{ fontSize: 17, color: '#d97706' }} />
              <Typography variant="caption" sx={{ color: '#92600c' }}>
                Bạn chưa đủ quyền tải trực tiếp — gửi yêu cầu để <strong>Ban Giám Đốc</strong> duyệt.
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button
          variant="contained"
          disabled={busy || pending || count === 0}
          onClick={() => onSubmit(filtered, summary)}
          sx={{ background: LEGACY.headerGradient }}
        >
          {busy ? 'Đang xử lý…' : actionLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Thanh DUYỆT XUẤT EXCEL: người duyệt thấy các yêu cầu chờ; người gửi thấy trạng thái của mình. */
function ExportApprovalBanner({ isApprover, pending, myRequest, onApprove, onReject, onDownload, onDismiss }: {
  isApprover: boolean;
  pending: ExportRequest[];
  myRequest?: ExportRequest;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDownload: () => void;
  onDismiss: (id: string) => void;
}) {
  if (isApprover) {
    if (pending.length === 0) return null;
    return (
      <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5, borderColor: 'rgba(217,119,6,0.4)', bgcolor: 'rgba(217,119,6,0.06)' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
          <LockOutlinedIcon sx={{ fontSize: 18, color: '#d97706' }} />
          <Typography variant="subtitle2" fontWeight={800}>Yêu cầu xuất Excel chờ duyệt ({pending.length})</Typography>
        </Stack>
        <Stack spacing={0.75}>
          {pending.map((r) => (
            <Stack key={r.id} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 160 }}>
                <strong>{r.requestedByName || '—'}</strong> xin xuất {r.detail || 'danh sách hồ sơ'}
                <Typography component="span" variant="caption" color="text.secondary"> · {new Date(r.requestedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Typography>
              </Typography>
              <Button size="small" color="success" variant="contained" startIcon={<CheckCircleOutlineIcon sx={{ fontSize: 16 }} />} onClick={() => onApprove(r.id)}>Duyệt</Button>
              <Button size="small" color="error" onClick={() => onReject(r.id)}>Từ chối</Button>
            </Stack>
          ))}
        </Stack>
      </Paper>
    );
  }
  if (!myRequest) return null;
  if (myRequest.status === 'approved') {
    return (
      <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5, borderColor: 'rgba(22,163,74,0.4)', bgcolor: 'rgba(22,163,74,0.07)' }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#16a34a' }} />
          <Typography variant="body2" sx={{ flex: 1, minWidth: 160 }}>
            Yêu cầu xuất Excel đã được <strong>{myRequest.decidedByName || 'Ban Giám Đốc'}</strong> duyệt. Tải về ngay.
          </Typography>
          <Button size="small" variant="contained" startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />}
            onClick={onDownload} sx={{ bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' } }}>Tải Excel</Button>
        </Stack>
      </Paper>
    );
  }
  if (myRequest.status === 'rejected') {
    return (
      <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5, borderColor: 'rgba(220,38,38,0.4)', bgcolor: 'rgba(220,38,38,0.06)' }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <ReportProblemOutlinedIcon sx={{ fontSize: 18, color: '#dc2626' }} />
          <Typography variant="body2" sx={{ flex: 1, minWidth: 160 }}>
            Yêu cầu xuất Excel bị từ chối{myRequest.rejectReason ? ` — “${myRequest.rejectReason}”` : ''}.
          </Typography>
          <Button size="small" onClick={() => onDismiss(myRequest.id)}>Bỏ qua</Button>
        </Stack>
      </Paper>
    );
  }
  // pending
  return (
    <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5, borderColor: 'rgba(217,119,6,0.35)', bgcolor: 'rgba(217,119,6,0.05)' }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <HourglassEmptyIcon sx={{ fontSize: 18, color: '#d97706' }} />
        <Typography variant="body2" sx={{ flex: 1, minWidth: 160 }}>
          Đã gửi yêu cầu xuất Excel — đang chờ Ban Giám Đốc duyệt.
        </Typography>
        <Button size="small" onClick={() => onDismiss(myRequest.id)}>Huỷ yêu cầu</Button>
      </Stack>
    </Paper>
  );
}

/** Sửa THÔNG TIN CƠ BẢN của hồ sơ (tên/khách/điểm đến/ngày/số khách/ghi chú). */
function EditBasicInfoDialog({ profile, primary, onClose, onSave }: {
  profile: TourProfile;
  primary?: CloudQuoteEntry;
  onClose: () => void;
  onSave: (info: { name: string; customerId: string | null; customerName: string; dest: string; startDate: string | null; pax: number; note: string }, lock: boolean) => Promise<void>;
}) {
  const customers = useCustomerStore((s) => s.customers);
  const saveCustomer = useCustomerStore((s) => s.save);
  const b = displayBasics(profile, primary);
  // Khách hàng: ưu tiên hồ sơ KH đã gắn (customerId) → đồng bộ với hồ sơ khách hàng thật.
  const initialCustomer = profile.customerId ? customers.find((c) => c.id === profile.customerId) ?? null : null;
  const [name, setName] = useState(profile.name ?? '');
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer);
  const [customerName, setCustomerName] = useState(b.custName ?? '');
  const [dest, setDest] = useState(b.dest ?? '');
  const [startDate, setStartDate] = useState<string>(b.departDate ? b.departDate.slice(0, 10) : '');
  const [pax, setPax] = useState<string>(b.pax ? String(b.pax) : '');
  const [note, setNote] = useState(profile.note ?? '');
  const [lock, setLock] = useState(profile.infoLocked ?? true);
  const [busy, setBusy] = useState(false);
  const hasPrimary = !!primary;

  // Giá trị ĐỒNG BỘ ban đầu (theo báo giá chính). Nếu người dùng sửa tay bất kỳ
  // trường nào trong số này thì PHẢI tự khoá, nếu không displayBasics sẽ lấy lại
  // giá trị báo giá chính đè lên → "sửa xong không đổi".
  const syncedDirty =
    customerName.trim() !== (b.custName ?? '') ||
    dest.trim() !== (b.dest ?? '') ||
    startDate !== (b.departDate ? b.departDate.slice(0, 10) : '') ||
    pax !== (b.pax ? String(b.pax) : '');

  // Tạo nhanh hồ sơ khách mới từ tên gõ vào rồi gắn luôn (id sinh sẵn để dùng lại ngay).
  const createAndPick = async (rawName: string) => {
    const nm = rawName.trim();
    if (!nm) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    // createdAt/createdBy do customerStore.save tự điền cho bản ghi mới.
    const c: Customer = { id, name: nm, type: 'company', contacts: [], note: '', createdAt: '', createdBy: '' };
    setBusy(true);
    try {
      await saveCustomer(c);
      setCustomer(c);
      setCustomerName(nm);
    } catch (e) {
      window.alert('❌ Không tạo được hồ sơ khách: ' + (e as Error).message);
    } finally { setBusy(false); }
  };

  const submit = async () => {
    setBusy(true);
    // Sửa tay trường đồng bộ → tự khoá để giá trị sửa tay được giữ & hiển thị.
    const effectiveLock = lock || syncedDirty;
    try {
      await onSave(
        { name, customerId: customer?.id ?? null, customerName, dest, startDate: startDate || null, pax: Number(pax) || 0, note },
        effectiveLock,
      );
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>
        Sửa thông tin cơ bản
        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontWeight: 400 }}>{profile.code}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.75} sx={{ mt: 0.5 }}>
          <TextField size="small" label="Tên tour / hồ sơ" value={name} onChange={(e) => setName(e.target.value)} autoFocus fullWidth />
          <Autocomplete<Customer, false, false, true>
            freeSolo
            size="small"
            options={customers}
            value={customer}
            inputValue={customerName}
            filterOptions={(opts, params) => {
              const filtered = custFilter(opts, params);
              const q = params.inputValue.trim();
              // Gõ tên chưa có hồ sơ → đề xuất tạo nhanh hồ sơ khách (tránh khách "mồ côi" chỉ có chuỗi tên).
              if (q && !opts.some((o) => o.name.trim().toLowerCase() === q.toLowerCase())) {
                filtered.push({ id: CREATE_CUSTOMER_ID, name: q, type: 'company', contacts: [], note: '', createdAt: '', createdBy: '' });
              }
              return filtered;
            }}
            getOptionLabel={(o) => (typeof o === 'string' ? o : o.id === CREATE_CUSTOMER_ID ? `➕ Tạo hồ sơ khách "${o.name}"` : o.name)}
            isOptionEqualToValue={(a, b2) => a.id === b2.id}
            onChange={(_, v) => {
              if (v && typeof v !== 'string') {
                if (v.id === CREATE_CUSTOMER_ID) { void createAndPick(v.name); }
                else { setCustomer(v); setCustomerName(v.name); }
              } else { setCustomer(null); setCustomerName(typeof v === 'string' ? v : ''); }
            }}
            onInputChange={(_, v, reason) => {
              if (reason === 'input') { setCustomerName(v); setCustomer(null); }
            }}
            renderOption={(props, o) => (
              <li {...props} key={o.id}>
                {o.id === CREATE_CUSTOMER_ID ? (
                  <Typography variant="body2" sx={{ color: '#0d7a6a', fontWeight: 700 }}>➕ Tạo hồ sơ khách “{o.name}”</Typography>
                ) : (
                  <Box>
                    <Typography variant="body2">{o.name}</Typography>
                    {o.contacts?.[0] && <Typography variant="caption" color="text.secondary">{o.contacts[0].name} · {o.contacts[0].phone}</Typography>}
                  </Box>
                )}
              </li>
            )}
            renderInput={(pr) => (
              <TextField {...pr} label="Tên khách hàng" placeholder="Chọn hồ sơ khách hàng hoặc gõ tên…"
                helperText={customer ? '🔗 Đã liên kết hồ sơ khách hàng' : 'Chưa liên kết — gõ tên hoặc chọn từ danh sách'} />
            )}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField size="small" label="Ngày khởi hành" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField size="small" label="Số lượng khách" type="number" value={pax} onChange={(e) => setPax(e.target.value)} inputProps={{ min: 0 }} fullWidth />
          </Stack>
          <TextField size="small" label="Điểm đến / quốc gia" value={dest} onChange={(e) => setDest(e.target.value)} fullWidth />
          <TextField size="small" label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} fullWidth />
          <FormControlLabel
            control={<Switch size="small" checked={lock} onChange={(e) => setLock(e.target.checked)} />}
            label={<Typography variant="caption">Khoá thông tin — ưu tiên giá trị này, không tự đồng bộ lại từ báo giá chính</Typography>}
          />
          {hasPrimary && !lock && syncedDirty && (
            <Typography variant="caption" sx={{ color: 'warning.main' }}>
              Bạn đã sửa tay thông tin khách / ngày / số khách → hồ sơ sẽ TỰ KHOÁ để giữ giá trị này (không bị báo giá chính ghi đè).
            </Typography>
          )}
          {hasPrimary && !lock && !syncedDirty && (
            <Typography variant="caption" color="text.secondary">
              Khi KHÔNG khoá, thông tin khách / ngày / số khách sẽ tiếp tục đồng bộ theo báo giá chính mỗi lần lưu báo giá.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="contained" disabled={busy || !name.trim()} onClick={() => void submit()}
          sx={{ background: LEGACY.headerGradient }}>{busy ? 'Đang lưu…' : 'Lưu'}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** XEM NHANH (read-only) các thông tin cơ bản của hồ sơ — gọn, không nạp báo giá. */
function QuickViewDialog({ profile, meta, quoteCount, showPrice, onClose, onOpen }: {
  profile: TourProfile;
  meta: { primary?: CloudQuoteEntry; stage: DealStage; links: ProfileLinks; guide: number; values: ProfileValues; country?: string };
  quoteCount: number;
  showPrice: boolean;
  onClose: () => void;
  onOpen: () => void;
}) {
  const b = displayBasics(profile, meta.primary);
  const cm = categoryMeta(tourCategoryOf(profile));
  const sm = STAGE_META(meta.stage);
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip size="small" label={profile.code} sx={{ fontWeight: 800, bgcolor: 'rgba(13,122,106,0.12)', color: '#0d7a6a' }} />
          <Chip size="small" label={`${cm.icon} ${cm.short}`} sx={{ height: 20, bgcolor: `${cm.color}1a`, color: cm.color, fontWeight: 700 }} />
          <Chip size="small" label={sm.short} sx={{ height: 20, bgcolor: `${sm.color}1a`, color: sm.color, fontWeight: 700 }} />
          {profile.infoLocked && <Tooltip title="Thông tin cơ bản đã khoá (sửa tay)"><LockOutlinedIcon sx={{ fontSize: 15, color: '#6b7280' }} /></Tooltip>}
        </Stack>
        <Typography fontWeight={800} fontSize={15} sx={{ mt: 0.75 }}>{profile.name || '(chưa đặt tên)'}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
          <Meta label="Khách hàng" value={b.custName || '—'} />
          <Meta label="Khởi hành" value={b.departDate ? new Date(b.departDate).toLocaleDateString('vi-VN') : '—'} />
          <Meta label="Số khách" value={b.pax ? String(b.pax) : '—'} />
          <Meta label="Điểm đến" value={b.dest || '—'} />
          <Meta label="Số báo giá" value={String(quoteCount)} />
          {meta.links.contract > 0 && <Meta label="Hợp đồng" value={String(meta.links.contract)} />}
          {meta.links.visa > 0 && <Meta label="Visa" value={String(meta.links.visa)} />}
          {meta.links.menu > 0 && <Meta label="Thực đơn" value={String(meta.links.menu)} />}
          {meta.links.itinerary > 0 && <Meta label="Chương trình" value={String(meta.links.itinerary)} />}
          {meta.guide > 0 && <Meta label="Lịch HDV" value={String(meta.guide)} />}
          <Meta label="Người tạo" value={profile.createdBy || '—'} />
        </Box>
        {showPrice && (
          <Box sx={{ mt: 1.25 }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Giá trị tour</Typography>
            <ValueLadder values={meta.values} />
          </Box>
        )}
        {profile.note && (
          <Box sx={{ mt: 1.25 }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary">Ghi chú</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{profile.note}</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
        <Button variant="contained" startIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />} onClick={onOpen}
          sx={{ background: LEGACY.headerGradient }}>Mở hồ sơ</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Cổng đóng hồ sơ: liệt kê checklist (✓/○), cho phép lưu trữ dù còn thiếu. */
function ClosingChecklistDialog({ state, onClose, onArchiveAnyway }: {
  state: { profile: TourProfile; items: ClosingItem[] } | null;
  onClose: () => void; onArchiveAnyway: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (state) setBusy(false); }, [state]);
  const pending = state ? closingPending(state.items) : [];
  const submit = async () => { setBusy(true); try { await onArchiveAnyway(); } finally { setBusy(false); } };
  return (
    <Dialog open={!!state} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Lưu trữ (đóng) hồ sơ?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Hồ sơ <strong>{state?.profile.code}</strong> còn <strong>{pending.length}</strong> mục chưa hoàn tất.
          Bạn vẫn có thể lưu trữ, nhưng nên hoàn tất trước khi đóng.
        </Typography>
        <Stack spacing={0.75}>
          {(state?.items ?? []).map((it) => (
            <Stack key={it.key} direction="row" spacing={1} alignItems="center">
              {it.done
                ? <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#16a34a' }} />
                : <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: '#d97706' }} />}
              <Typography fontSize={13.5} sx={{ color: it.done ? 'text.secondary' : 'text.primary', fontWeight: it.done ? 400 : 600 }}>
                {it.label}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Để sau</Button>
        <Button variant="contained" color="warning" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Đang lưu trữ…' : 'Lưu trữ dù còn thiếu'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Xoá hẳn hồ sơ tour. Báo giá / hợp đồng / visa liên kết KHÔNG bị xoá — chỉ gỡ
 *  liên kết (FK ON DELETE SET NULL). Hành động không hoàn tác được. */
function DeleteProfileDialog({ profile, quoteCount, linkCount, onClose, onDelete }: {
  profile: TourProfile | null; quoteCount: number; linkCount: number;
  onClose: () => void; onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (profile) setBusy(false); }, [profile]);
  const submit = async () => { setBusy(true); try { await onDelete(); } finally { setBusy(false); } };
  const detached = quoteCount + linkCount;
  return (
    <Dialog open={!!profile} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Xoá hồ sơ tour?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Xoá hẳn hồ sơ <strong>{profile?.code}</strong>
          {profile?.name ? <> — {profile.name}</> : null}. Hành động này <strong>không hoàn tác</strong> được.
        </Typography>
        {detached > 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {quoteCount > 0 && <>{quoteCount} báo giá </>}
            {quoteCount > 0 && linkCount > 0 && '· '}
            {linkCount > 0 && <>{linkCount} hợp đồng / visa / thực đơn / chương trình </>}
            đang gắn vào hồ sơ sẽ được <strong>gỡ liên kết</strong> (không bị xoá) và vẫn truy cập được riêng lẻ.
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary">Hồ sơ trống — không có dữ liệu liên kết.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="contained" color="error" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Đang xoá…' : 'Xoá hồ sơ'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Chuyển một báo giá sang hồ sơ tour khác (sửa khi gắn nhầm). */
function MoveQuoteDialog({ state, options, onClose, onMove }: {
  state: { cloudId: string; fromProfileId: string; quoteName: string } | null;
  options: TourProfile[];
  onClose: () => void;
  onMove: (toProfileId: string) => Promise<void>;
}) {
  const [pick, setPick] = useState<TourProfile | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (state) { setPick(null); setBusy(false); } }, [state]);
  const submit = async () => { if (!pick) return; setBusy(true); try { await onMove(pick.id); } finally { setBusy(false); } };
  return (
    <Dialog open={!!state} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Chuyển báo giá sang hồ sơ khác</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Chuyển <strong>{state?.quoteName}</strong> sang một hồ sơ tour khác. Hồ sơ nguồn sẽ tự
          chuyển báo giá chính (hoặc lưu trữ nếu hết báo giá).
        </Typography>
        <Autocomplete
          options={options} value={pick} onChange={(_, v) => setPick(v)}
          getOptionLabel={(p) => `${p.code} — ${p.name || '(chưa đặt tên)'}`}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderOption={(props, p) => (<li {...props} key={p.id}><Box><Typography variant="body2" fontWeight={700}>{p.code}</Typography><Typography variant="caption" color="text.secondary">{p.name || '(chưa đặt tên)'}</Typography></Box></li>)}
          renderInput={(pr) => <TextField {...pr} autoFocus label="Hồ sơ đích" placeholder="Chọn hồ sơ…" />}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="contained" disabled={busy || !pick} onClick={() => void submit()}
          sx={{ background: LEGACY.headerGradient }}>{busy ? 'Đang chuyển…' : 'Chuyển'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function CreateEmptyDialog({ open, onClose, onCreate }: {
  open: boolean; onClose: () => void; onCreate: (category: TourCategory, name: string) => Promise<void>;
}) {
  const [category, setCategory] = useState<TourCategory>('incentive_domestic');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setCategory('incentive_domestic'); setName(''); setBusy(false); } }, [open]);
  const submit = async () => { setBusy(true); try { await onCreate(category, name.trim()); } finally { setBusy(false); } };
  const cm = categoryMeta(category);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Tạo hồ sơ trống</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Mở một hồ sơ chưa có báo giá — gắn thực đơn / chương trình / visa / hợp đồng vào sau (DirectLinkPanel).
          Mã sinh theo loại (prefix <strong>{cm.prefix}</strong>).
        </Typography>
        <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Loại hồ sơ</Typography>
        <Stack direction="row" spacing={0.75} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          {TOUR_CATEGORIES.map((c) => (
            <Chip key={c.key} clickable size="small"
              label={`${c.icon} ${c.short}`}
              variant={category === c.key ? 'filled' : 'outlined'}
              onClick={() => setCategory(c.key)}
              sx={category === c.key ? { bgcolor: `${c.color}22`, color: c.color, fontWeight: 800, borderColor: c.color } : {}}
            />
          ))}
        </Stack>
        <TextField fullWidth autoFocus label="Tên hồ sơ / tour" value={name}
          onChange={(e) => setName(e.target.value)} placeholder="VD: Đà Lạt – Đoàn ABC" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="contained" disabled={busy || !name.trim()} onClick={() => void submit()}
          sx={{ background: LEGACY.headerGradient }}>{busy ? 'Đang tạo…' : 'Tạo hồ sơ'}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Bộ lọc đa chiều: khách hàng / loại hồ sơ / quốc gia / giai đoạn. */
function FilterPanel({
  customers, countries, tags, fltCustomer, setFltCustomer, fltCategory, setFltCategory,
  fltCountry, setFltCountry, fltStage, setFltStage, fltTag, setFltTag, onClear, activeFilters,
}: {
  customers: string[]; countries: string[]; tags: string[];
  fltCustomer: string; setFltCustomer: (v: string) => void;
  fltCategory: TourCategory | ''; setFltCategory: (v: TourCategory | '') => void;
  fltCountry: string; setFltCountry: (v: string) => void;
  fltStage: DealStage[]; setFltStage: (v: DealStage[]) => void;
  fltTag: string; setFltTag: (v: string) => void;
  onClear: () => void; activeFilters: number;
}) {
  const stageCols = [...DEAL_STAGES, DEAL_STAGE_LOST];
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(4,1fr)' }, gap: 1 }}>
        <Autocomplete size="small" options={customers} value={fltCustomer || null}
          onChange={(_, v) => setFltCustomer(v ?? '')}
          renderInput={(pr) => <TextField {...pr} label="Khách hàng" placeholder="Tất cả" />} />
        <TextField select size="small" label="Loại hồ sơ" value={fltCategory}
          onChange={(e) => setFltCategory(e.target.value as TourCategory | '')}
          SelectProps={{ native: true }} InputLabelProps={{ shrink: true }}>
          <option value="">Tất cả</option>
          {TOUR_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </TextField>
        <Autocomplete size="small" options={countries} value={fltCountry || null}
          onChange={(_, v) => setFltCountry(v ?? '')}
          renderInput={(pr) => <TextField {...pr} label="Quốc gia / điểm đến" placeholder="Tất cả" />} />
        <Autocomplete
          multiple size="small" disableCloseOnSelect
          options={stageCols}
          value={stageCols.filter((s) => fltStage.includes(s.key))}
          onChange={(_, v) => setFltStage(v.map((s) => s.key))}
          getOptionLabel={(s) => s.short}
          isOptionEqualToValue={(a, b) => a.key === b.key}
          renderTags={(value, getTagProps) =>
            value.map((s, idx) => {
              const { key, ...tagProps } = getTagProps({ index: idx });
              return <Chip key={key} {...tagProps} size="small" label={s.short}
                sx={{ height: 20, bgcolor: `${s.color}1a`, color: s.color, fontWeight: 700 }} />;
            })
          }
          renderInput={(pr) => <TextField {...pr} label="Giai đoạn" placeholder={fltStage.length ? '' : 'Tất cả'} />}
        />
        {tags.length > 0 && (
          <Autocomplete size="small" options={tags} value={fltTag || null}
            onChange={(_, v) => setFltTag(v ?? '')}
            renderInput={(pr) => <TextField {...pr} label="Nhãn" placeholder="Tất cả" />} />
        )}
      </Box>
      {activeFilters > 0 && (
        <Box sx={{ mt: 1, textAlign: 'right' }}>
          <Button size="small" onClick={onClear}>Xoá bộ lọc ({activeFilters})</Button>
        </Box>
      )}
    </Paper>
  );
}

/** Gửi yêu cầu duyệt XOÁ hồ sơ (người dưới Trưởng Phòng) — chọn 1 người duyệt + lý do. */
function RequestDeleteDialog({ profile, users, currentUser, onClose, onRequest }: {
  profile: TourProfile | null; users: User[]; currentUser: User | null;
  onClose: () => void; onRequest: (approver: User, reason: string) => Promise<void>;
}) {
  const [approver, setApprover] = useState<User | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (profile) { setApprover(null); setReason(''); setBusy(false); } }, [profile]);
  const approvers = users.filter((u) => isApprover(u.role));
  const submit = async () => { if (!approver) return; setBusy(true); try { await onRequest(approver, reason); } finally { setBusy(false); } };
  return (
    <Dialog open={!!profile} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Gửi yêu cầu xoá hồ sơ</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Bạn không đủ quyền xoá trực tiếp. Yêu cầu xoá hồ sơ <strong>{profile?.code}</strong>
          {profile?.name ? <> — {profile.name}</> : null} sẽ được gửi tới <strong>Trưởng Phòng</strong> (hoặc cấp cao hơn) để duyệt.
        </Typography>
        <Autocomplete
          options={approvers} value={approver} onChange={(_, v) => setApprover(v)}
          getOptionLabel={(u) => userLabel(u, currentUser)}
          isOptionEqualToValue={(a, b) => a.u === b.u}
          renderInput={(pr) => <TextField {...pr} autoFocus label="Người duyệt" placeholder="Chọn người duyệt…" />}
          sx={{ mb: 1.5 }}
        />
        <TextField fullWidth multiline minRows={2} label="Lý do (tuỳ chọn)" value={reason}
          onChange={(e) => setReason(e.target.value)} placeholder="VD: tạo nhầm, trùng hồ sơ…" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="contained" disabled={busy || !approver} onClick={() => void submit()}
          sx={{ background: LEGACY.headerGradient }}>{busy ? 'Đang gửi…' : 'Gửi yêu cầu'}</Button>
      </DialogActions>
    </Dialog>
  );
}

type Summary = {
  total: number; open: number; archived: number; won: number; lost: number;
  byStage: Record<string, number>; value: number; remaining: number;
  profit: number; profitN: number; margin: MarginSummary; winRate: number | null;
};

const pct1 = (n: number) => `${n.toFixed(1)}%`;

/** Bảng tổng quan điều hành theo các hồ sơ đang hiển thị. */
function DashboardPanel({ summary, showPrice }: { summary: Summary; showPrice: boolean }) {
  const cards: { label: string; value: string; color?: string }[] = [
    { label: 'Tổng hồ sơ', value: String(summary.total) },
    { label: 'Đang mở', value: String(summary.open) },
    { label: 'Đã chốt', value: String(summary.won), color: '#0d7a6a' },
    { label: 'Thua / Huỷ', value: String(summary.lost), color: '#dc2626' },
    { label: 'Win-rate', value: summary.winRate === null ? '—' : `${summary.winRate}%`, color: '#7c3aed' },
  ];
  if (showPrice) {
    cards.push({ label: 'Tổng giá trị', value: fmtVND(summary.value) });
    cards.push({ label: 'Công nợ còn lại', value: fmtVND(summary.remaining), color: '#d97706' });
    if (summary.profitN > 0) cards.push({ label: `Biên lợi thực (${summary.profitN})`, value: fmtVND(summary.profit), color: summary.profit >= 0 ? '#16a34a' : '#dc2626' });
    const m = summary.margin;
    if (m.n > 0 && m.plannedAvgPct !== null && m.actualAvgPct !== null && m.variancePct !== null) {
      cards.push({ label: `Biên KH (TB, ${m.n})`, value: pct1(m.plannedAvgPct), color: '#6b7280' });
      cards.push({ label: 'Biên thực (TB)', value: pct1(m.actualAvgPct), color: m.actualAvgPct >= m.plannedAvgPct ? '#16a34a' : '#dc2626' });
      cards.push({ label: 'Chênh KH↔thực', value: `${m.variancePct >= 0 ? '+' : ''}${m.variancePct.toFixed(1)}đ%`, color: m.variancePct >= 0 ? '#16a34a' : '#dc2626' });
    }
  }
  const stageCols = [...DEAL_STAGES, DEAL_STAGE_LOST];
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(4,1fr)', md: 'repeat(8,1fr)' }, gap: 1, mb: 1.5 }}>
        {cards.map((c) => (
          <Box key={c.label} sx={{ textAlign: 'center', p: 0.75, borderRadius: 1.5, bgcolor: 'rgba(0,0,0,0.02)' }}>
            <Typography fontSize={17} fontWeight={900} sx={{ color: c.color ?? 'text.primary', lineHeight: 1.1 }}>{c.value}</Typography>
            <Typography variant="caption" color="text.secondary">{c.label}</Typography>
          </Box>
        ))}
      </Box>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {stageCols.map((s) => {
          const n = summary.byStage[s.key] ?? 0;
          if (n === 0) return null;
          return <Chip key={s.key} size="small" label={`${s.short}: ${n}`} sx={{ height: 22, bgcolor: `${s.color}1a`, color: s.color, fontWeight: 700 }} />;
        })}
      </Stack>
    </Paper>
  );
}

function ProfileRow({
  profile, stage, primary, guideCount, quotes, links, values, risks, expanded, compact, pinned, showPrice,
  currentUser, users, onToggle, onTogglePin, onEdit, onQuickView, onOpenProfile, onOpenQuote, onSetPrimary, onArchive, onDelete, onMoveQuote,
  onApproveDelete, onRejectDelete,
}: {
  profile: TourProfile; stage: DealStage; primary?: CloudQuoteEntry; guideCount: number; quotes: CloudQuoteEntry[];
  links: ProfileLinks; values: ProfileValues; risks: TourRisk[]; expanded: boolean; compact: boolean; pinned: boolean; showPrice: boolean;
  currentUser: User | null; users: User[];
  onToggle: () => void; onTogglePin: () => void; onEdit: () => void; onQuickView: () => void; onOpenProfile: () => void; onOpenQuote: (cloudId: string) => void;
  onSetPrimary: (cloudId: string) => void; onArchive: (on: boolean) => void; onDelete: () => void;
  onMoveQuote: (cloudId: string, quoteName: string) => void;
  onApproveDelete: () => void; onRejectDelete: () => void;
}) {
  const sm = STAGE_META(stage);
  const cm = categoryMeta(tourCategoryOf(profile));
  const canShare = canShareRecord(currentUser, profile, users);
  const canApprove = canApproveDelete(currentUser, profile);
  const pay = primary?.paymentSummary;
  // KHÁCH/NGÀY/PAX: ưu tiên hồ sơ khi đã KHOÁ (sửa tay), ngược lại theo báo giá chính.
  const { custName, departDate, pax } = displayBasics(profile, primary);
  const archived = profile.status === 'archived';
  const progressSteps = profileProgressSteps({
    hasQuote: quotes.length > 0,
    contractCount: links.contract,
    guideCount,
    settled: !!primary?.settlementSummary,
    nccPaid: !!pay && pay.remaining <= 0,
  });

  return (
    <Paper
      variant="outlined"
      sx={{
        p: compact ? 1 : 1.5,
        borderLeft: `4px solid ${sm.color}`,
        opacity: archived ? 0.72 : 1,
        bgcolor: archived ? 'rgba(0,0,0,0.015)' : 'background.paper',
        transition: 'box-shadow .18s ease, border-color .18s ease, transform .18s ease',
        '&:hover': { boxShadow: '0 3px 14px rgba(15,58,74,0.10)', borderLeftColor: sm.color, transform: 'translateY(-1px)' },
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1.25}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={profile.code} sx={{ fontWeight: 800, bgcolor: 'rgba(13,122,106,0.12)', color: '#0d7a6a' }} />
            <Typography fontWeight={800} fontSize={14.5} noWrap sx={{ maxWidth: { xs: 180, sm: 360 } }}>
              {profile.name || '(chưa đặt tên)'}
            </Typography>
            <Tooltip title={cm.label}>
              <Chip size="small" label={`${cm.icon} ${cm.short}`} sx={{ height: 20, bgcolor: `${cm.color}1a`, color: cm.color, fontWeight: 700 }} />
            </Tooltip>
            <Chip size="small" label={sm.short}
              icon={<Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: sm.color, ml: 0.75 }} />}
              sx={{ height: 20, bgcolor: `${sm.color}1a`, color: sm.color, fontWeight: 700, '& .MuiChip-icon': { ml: 0.6 } }} />
            {archived && (
              <Chip size="small" label="Lưu trữ" icon={<ArchiveOutlinedIcon sx={{ fontSize: 13 }} />}
                sx={{ height: 20, bgcolor: 'rgba(100,116,139,0.14)', color: '#475569', fontWeight: 700, '& .MuiChip-icon': { color: '#475569' } }} />
            )}
            {profile.infoLocked && (
              <Tooltip title="Thông tin cơ bản đã khoá (sửa tay) — không tự đồng bộ từ báo giá">
                <LockOutlinedIcon sx={{ fontSize: 14, color: '#6b7280' }} />
              </Tooltip>
            )}
            <RiskChip risks={risks} />
            {(profile.tags ?? []).map((t) => (
              <Chip key={t} size="small" label={`# ${t}`} variant="outlined" sx={{ height: 20, borderColor: '#7c3aed', color: '#7c3aed' }} />
            ))}
          </Stack>
          <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }} alignItems="center" flexWrap="wrap" useFlexGap>
            <Meta label="Khách" value={custName || '—'} />
            <Meta label="Khởi hành" value={departDate ? new Date(departDate).toLocaleDateString('vi-VN') : '—'} />
            {pax ? <Meta label="Số khách" value={String(pax)} /> : null}
            <Meta label="Báo giá" value={String(quotes.length)} />
            {!compact && links.contract > 0 && <Meta label="Hợp đồng" value={String(links.contract)} />}
            {!compact && links.visa > 0 && <Meta label="Visa" value={String(links.visa)} />}
            {!compact && links.menu > 0 && <Meta label="Thực đơn" value={String(links.menu)} />}
            {!compact && links.itinerary > 0 && <Meta label="Chương trình" value={String(links.itinerary)} />}
            {!compact && guideCount > 0 && <Meta label="Lịch HDV" value={String(guideCount)} />}
            {showPrice && <ValueLadder values={values} compact={compact} />}
          </Stack>
          {/* Pipeline tiến độ giai đoạn + độ hoàn thiện hồ sơ */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={compact ? 0.75 : 1.25} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mt: compact ? 0.5 : 0.75 }}>
            <Box sx={{ flex: 1, minWidth: 0, maxWidth: { sm: 360 } }}>
              <StageStepper stage={stage} compact={compact} />
            </Box>
            <ProfileProgress steps={progressSteps} compact={compact} />
          </Stack>
          {!compact && (
            <Stack direction="row" spacing={1} sx={{ mt: 0.75 }} alignItems="center" flexWrap="wrap" useFlexGap>
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary' }}>
                <PersonOutlineIcon sx={{ fontSize: 14 }} />
                <Typography variant="caption">
                  Tạo bởi <strong>{profile.createdBy || '—'}</strong>
                  {profile.createdAt ? ` · ${new Date(profile.createdAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                </Typography>
              </Stack>
              <PeopleStrip collaborators={profile.collaborators} followers={profile.followers} eventStaff={profile.eventStaff} />
            </Stack>
          )}
        </Box>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title={pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}>
            <IconButton size="small" color={pinned ? 'primary' : 'default'} onClick={onTogglePin}>
              {pinned ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          {(profile.collaborators?.length || profile.followers?.length) ? (
            <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 24, height: 24, fontSize: 11 } }}>
              {[...(profile.collaborators ?? []), ...(profile.followers ?? [])].map((c, i) => (
                <Tooltip key={c.u + i} title={c.name}><Avatar>{c.name.charAt(0)}</Avatar></Tooltip>
              ))}
            </AvatarGroup>
          ) : null}
          <Tooltip title="Xem nhanh thông tin cơ bản">
            <IconButton size="small" onClick={onQuickView}><VisibilityIcon fontSize="small" /></IconButton>
          </Tooltip>
          {canShare && (
            <Tooltip title="Sửa thông tin cơ bản">
              <IconButton size="small" onClick={onEdit}><EditOutlinedIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
          {canShare && (
            <Tooltip title={archived ? 'Mở lại hồ sơ' : 'Lưu trữ hồ sơ'}>
              <IconButton size="small" onClick={() => onArchive(!archived)}>
                {archived ? <UnarchiveOutlinedIcon fontSize="small" /> : <ArchiveOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          {canShare && (
            <Tooltip title="Xoá hồ sơ">
              <IconButton size="small" color="error" onClick={onDelete}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Button size="small" variant="outlined" startIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
            onClick={onOpenProfile} sx={{ whiteSpace: 'nowrap' }}>Mở hồ sơ</Button>
          <IconButton size="small" onClick={onToggle}>{expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>
        </Stack>
      </Stack>

      {profile.deleteRequest && (
        <Box sx={{ mt: 1, p: 1, borderRadius: 1.5, bgcolor: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.25)' }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <GavelIcon sx={{ fontSize: 18, color: '#dc2626' }} />
            <Typography variant="caption" sx={{ flex: 1, minWidth: 140 }}>
              <strong>{profile.deleteRequest.byName}</strong> xin xoá hồ sơ này
              {profile.deleteRequest.reason ? <> — “{profile.deleteRequest.reason}”</> : null}
              {!canApprove && <> · chờ <strong>{profile.deleteRequest.approverName}</strong> duyệt</>}
            </Typography>
            {canApprove && (
              <>
                <Button size="small" color="error" variant="contained" startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
                  onClick={onApproveDelete}>Duyệt xoá</Button>
                <Button size="small" onClick={onRejectDelete}>Từ chối</Button>
              </>
            )}
          </Stack>
        </Box>
      )}

      <Collapse in={expanded} unmountOnExit>
        <Divider sx={{ my: 1.25 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' }, gap: 2 }}>
          {/* Các phương án báo giá của hồ sơ */}
          <Box>
            <Typography variant="caption" fontWeight={800} color="text.secondary">Phương án báo giá ({quotes.length})</Typography>
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              {quotes.length === 0 && <Typography variant="body2" color="text.secondary">Chưa có báo giá.</Typography>}
              {quotes.map((q) => {
                const isPrimary = q.cloudId === profile.primaryQuoteId;
                return (
                  <Stack key={q.cloudId} direction="row" alignItems="center" spacing={0.5}
                    sx={{ border: '1px solid rgba(15,58,74,0.12)', borderRadius: 1.5, px: 1, py: 0.5 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                        <Typography fontSize={13} fontWeight={600} noWrap>
                          {isPrimary ? '★ ' : ''}{q.name}
                        </Typography>
                        {q.valueRole && q.valueRole !== 'current' && (
                          <Chip size="small" label={QUOTE_VALUE_ROLE_LABEL[q.valueRole]}
                            sx={{ height: 16, fontSize: 9.5, fontWeight: 800,
                              bgcolor: `${VALUE_STEP_COLOR[q.valueRole]}1a`, color: VALUE_STEP_COLOR[q.valueRole] }} />
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">{q.quoteCode}{showPrice ? ` · ${fmtVND(q.totalCost ?? 0)}` : ''}</Typography>
                    </Box>
                    {canShare && !isPrimary && (
                      <Tooltip title="Đặt làm báo giá chính">
                        <IconButton size="small" onClick={() => onSetPrimary(q.cloudId)}><StarBorderIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                    {canShare && (
                      <Tooltip title="Chuyển sang hồ sơ khác">
                        <IconButton size="small" onClick={() => onMoveQuote(q.cloudId, q.name)}><SwapHorizIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                    <Button size="small" onClick={() => onOpenQuote(q.cloudId)}>Mở</Button>
                  </Stack>
                );
              })}
            </Stack>
          </Box>
          {/* Công nợ + chia sẻ */}
          <Box>
            {showPrice && pay && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" fontWeight={800} color="text.secondary">Công nợ NCC (báo giá chính)</Typography>
                <Stack direction="row" spacing={1.5} sx={{ mt: 0.25 }}>
                  <Meta label="Phải trả" value={fmtVND(pay.payable)} />
                  <Meta label="Đã trả" value={fmtVND(pay.paid)} />
                  <Meta label="Còn lại" value={fmtVND(pay.remaining)} />
                </Stack>
              </Box>
            )}
            <ShareControl profile={profile} users={users} currentUser={currentUser} canShare={canShare} />
          </Box>
        </Box>
        {/* ✈️ Chuyến bay của báo giá chính — nạp lười khi mở rộng dòng */}
        <FlightPanel primaryCloudId={primary?.cloudId} expanded={expanded} />
      </Collapse>
    </Paper>
  );
}

/** Hình dạng meta gom theo hồ sơ (dùng cho bảng). */
type ProfileMeta = { primary?: CloudQuoteEntry; stage: DealStage; links: ProfileLinks; guide: number; values: ProfileValues; country?: string };

/** Chế độ BẢNG — dày đặc, chọn nhiều, sắp xếp ở thanh công cụ. */
function ProfileTable({
  rows, metaOf, quotesByProfile, showPrice, pinned, selected,
  onToggleSelect, onToggleAll, onTogglePin, onQuickView, onOpenProfile,
}: {
  rows: TourProfile[];
  metaOf: (id: string) => ProfileMeta;
  quotesByProfile: Map<string, CloudQuoteEntry[]>;
  showPrice: boolean;
  pinned: Set<string>;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (on: boolean) => void;
  onTogglePin: (id: string) => void;
  onQuickView: (id: string) => void;
  onOpenProfile: (p: TourProfile) => void;
}) {
  const allSel = rows.length > 0 && rows.every((p) => selected.has(p.id));
  const someSel = selected.size > 0 && !allSel;
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
      <Table size="small" sx={{ '& td, & th': { whiteSpace: 'nowrap' } }}>
        <TableHead>
          <TableRow sx={{ '& th': { fontWeight: 800, bgcolor: 'rgba(13,122,106,0.06)' } }}>
            <TableCell padding="checkbox">
              <Checkbox size="small" checked={allSel} indeterminate={someSel} onChange={(e) => onToggleAll(e.target.checked)} />
            </TableCell>
            <TableCell padding="checkbox" />
            <TableCell>Mã</TableCell>
            <TableCell>Tên tour</TableCell>
            <TableCell>Loại</TableCell>
            <TableCell>Giai đoạn</TableCell>
            <TableCell>Khách</TableCell>
            <TableCell>Khởi hành</TableCell>
            <TableCell align="right">Khách</TableCell>
            {showPrice && <TableCell align="right">Giá trị hiện tại</TableCell>}
            <TableCell sx={{ minWidth: 130 }}>Hoàn thiện</TableCell>
            <TableCell align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((p) => {
            const mt = metaOf(p.id);
            const sm = STAGE_META(mt.stage);
            const cm = categoryMeta(tourCategoryOf(p));
            const b = displayBasics(p, mt.primary);
            const pay = mt.primary?.paymentSummary;
            const progress = profileProgressSteps({
              hasQuote: (quotesByProfile.get(p.id) ?? []).length > 0,
              contractCount: mt.links.contract, guideCount: mt.guide,
              settled: !!mt.primary?.settlementSummary, nccPaid: !!pay && pay.remaining <= 0,
            });
            const isSel = selected.has(p.id);
            return (
              <TableRow key={p.id} hover selected={isSel} sx={{ opacity: p.status === 'archived' ? 0.6 : 1, cursor: 'default' }}>
                <TableCell padding="checkbox">
                  <Checkbox size="small" checked={isSel} onChange={() => onToggleSelect(p.id)} />
                </TableCell>
                <TableCell padding="checkbox">
                  <IconButton size="small" color={pinned.has(p.id) ? 'primary' : 'default'} onClick={() => onTogglePin(p.id)}>
                    {pinned.has(p.id) ? <PushPinIcon sx={{ fontSize: 16 }} /> : <PushPinOutlinedIcon sx={{ fontSize: 16 }} />}
                  </IconButton>
                </TableCell>
                <TableCell><Chip size="small" label={p.code} sx={{ height: 20, fontWeight: 800, bgcolor: 'rgba(13,122,106,0.1)', color: '#0d7a6a' }} /></TableCell>
                <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <Typography fontSize={13} fontWeight={600} noWrap>{p.name || '(chưa đặt tên)'}</Typography>
                </TableCell>
                <TableCell><Tooltip title={cm.label}><span>{cm.icon} {cm.short}</span></Tooltip></TableCell>
                <TableCell><Chip size="small" label={sm.short} sx={{ height: 20, fontWeight: 700, bgcolor: `${sm.color}1a`, color: sm.color }} /></TableCell>
                <TableCell sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.custName || '—'}</TableCell>
                <TableCell>{b.departDate ? new Date(b.departDate).toLocaleDateString('vi-VN') : '—'}</TableCell>
                <TableCell align="right">{b.pax || '—'}</TableCell>
                {showPrice && <TableCell align="right">{typeof mt.values.current === 'number' ? fmtVND(mt.values.current) : '—'}</TableCell>}
                <TableCell><ProfileProgress steps={progress} compact /></TableCell>
                <TableCell align="right">
                  <Tooltip title="Xem nhanh"><IconButton size="small" onClick={() => onQuickView(p.id)}><VisibilityIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                  <Tooltip title="Mở hồ sơ"><IconButton size="small" onClick={() => onOpenProfile(p)}><OpenInNewIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** Khung chuyến bay (nạp lười) của báo giá chính trong hồ sơ. */
function FlightPanel({ primaryCloudId, expanded }: { primaryCloudId?: string; expanded: boolean }) {
  const [flights, setFlights] = useState<QuoteFlight[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded || !primaryCloudId || flights !== null || loading) return;
    let alive = true;
    setLoading(true);
    sbGetQuoteFlights(primaryCloudId)
      .then((f) => { if (alive) setFlights(f); })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [expanded, primaryCloudId, flights, loading]);

  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
        <FlightTakeoffIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography variant="caption" fontWeight={800} color="text.secondary">Chuyến bay (báo giá chính)</Typography>
      </Stack>
      {!primaryCloudId ? (
        <Typography variant="body2" color="text.secondary">Hồ sơ chưa có báo giá chính để lấy chuyến bay.</Typography>
      ) : loading || flights === null ? (
        <Typography variant="body2" color="text.secondary">Đang tải chuyến bay…</Typography>
      ) : error ? (
        <Typography variant="body2" color="error">⚠ {error}</Typography>
      ) : (
        <FlightSummary flights={flights} />
      )}
    </Box>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.1 }}>{label}</Typography>
      <Typography fontSize={13} fontWeight={700} noWrap>{value}</Typography>
    </Box>
  );
}

/** Màu cho từng mốc giá trị (hiện tại → hợp đồng → nghiệm thu). */
const VALUE_STEP_COLOR: Record<keyof ProfileValues, string> = {
  current: '#0d7a6a', contract: '#2563eb', settlement: '#7c3aed',
};
const VALUE_STEP_LABEL: Record<keyof ProfileValues, string> = {
  current: 'Hiện tại', contract: 'Hợp đồng', settlement: 'Nghiệm thu',
};

/**
 * "Thang giá trị" — 1 khối gọn thể hiện 3 mốc giá trị hồ sơ theo hàng
 * (Hiện tại → Hợp đồng → Nghiệm thu) + chênh lệch (Δ) giữa các mốc kề nhau.
 * Chỉ hiện những mốc có số; trống hoàn toàn → không render.
 */
function ValueLadder({ values, compact }: { values: ProfileValues; compact?: boolean }) {
  const steps = (['current', 'contract', 'settlement'] as (keyof ProfileValues)[])
    .map((k) => ({ k, val: values[k] }))
    .filter((s): s is { k: keyof ProfileValues; val: number } => typeof s.val === 'number');
  if (steps.length === 0) return null;
  return (
    <Box
      sx={{
        display: 'inline-flex', alignItems: 'stretch', flexWrap: 'wrap', gap: 0,
        borderRadius: 1.5, border: '1px solid rgba(15,58,74,0.12)', overflow: 'hidden',
        bgcolor: 'rgba(13,122,106,0.02)',
      }}
    >
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].val : null;
        const delta = prev !== null ? s.val - prev : null;
        const color = VALUE_STEP_COLOR[s.k];
        return (
          <Box key={s.k} sx={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', px: 0.5, color: 'text.disabled' }}>
                <ChevronRightIcon sx={{ fontSize: 16 }} />
                {delta !== null && delta !== 0 && (
                  <Typography sx={{ fontSize: 9, fontWeight: 800, lineHeight: 1, color: delta >= 0 ? '#16a34a' : '#dc2626' }}>
                    {delta >= 0 ? '+' : ''}{fmtVND(delta)}
                  </Typography>
                )}
              </Box>
            )}
            <Box sx={{ px: compact ? 0.9 : 1.1, py: compact ? 0.35 : 0.5, borderLeft: i > 0 ? 'none' : `3px solid ${color}` }}>
              <Typography sx={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color, lineHeight: 1.1, textTransform: 'uppercase' }}>
                {VALUE_STEP_LABEL[s.k]}
              </Typography>
              <Typography sx={{ fontSize: compact ? 12 : 13, fontWeight: 800, lineHeight: 1.15 }}>{fmtVND(s.val)}</Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** Meta 3 nhóm nhân sự (cộng tác / theo dõi / nhân sự event) — nhãn + màu + icon riêng. */
/**
 * Pipeline tiến độ giai đoạn — thanh segmented 7 bước (Yêu cầu→…→Đóng), tô màu
 * tới giai đoạn hiện tại, bước hiện tại nổi (đậm + nhãn). Deal thua/huỷ → badge đỏ.
 */
function StageStepper({ stage, compact }: { stage: DealStage; compact?: boolean }) {
  if (stage === 'lost') {
    return (
      <Chip size="small" label={DEAL_STAGE_LOST.short}
        sx={{ height: 20, fontWeight: 800, bgcolor: `${DEAL_STAGE_LOST.color}1a`, color: DEAL_STAGE_LOST.color }} />
    );
  }
  const idx = Math.max(0, DEAL_STAGES.findIndex((s) => s.key === stage));
  const cur = DEAL_STAGES[idx];
  return (
    <Stack direction="row" spacing={0.4} alignItems="center" sx={{ width: '100%', minWidth: 0 }}>
      <Stack direction="row" spacing={0.3} sx={{ flex: 1, minWidth: 0 }}>
        {DEAL_STAGES.map((s, i) => (
          <Tooltip key={s.key} title={s.label} arrow>
            <Box sx={{
              flex: 1, height: compact ? 4 : 6, borderRadius: 3,
              bgcolor: i <= idx ? s.color : 'rgba(15,58,74,0.10)',
              transition: 'background-color .2s ease',
              ...(i === idx ? { boxShadow: `0 0 0 2px ${s.color}33` } : {}),
            }} />
          </Tooltip>
        ))}
      </Stack>
      <Typography sx={{ fontSize: compact ? 10 : 11, fontWeight: 800, color: cur.color, whiteSpace: 'nowrap' }}>
        {cur.short}
      </Typography>
    </Stack>
  );
}

/** Một bước hoàn thiện hồ sơ (vận hành). */
type ProgressStep = { label: string; done: boolean };

/**
 * Suy các bước hoàn thiện hồ sơ từ dữ liệu liên kết (hàm thuần, tính trong UI):
 * có báo giá · có hợp đồng · có lịch HDV · đã quyết toán · hết công nợ NCC.
 */
function profileProgressSteps(args: {
  hasQuote: boolean; contractCount: number; guideCount: number;
  settled: boolean; nccPaid: boolean;
}): ProgressStep[] {
  return [
    { label: 'Có báo giá', done: args.hasQuote },
    { label: 'Có hợp đồng', done: args.contractCount > 0 },
    { label: 'Có lịch HDV', done: args.guideCount > 0 },
    { label: 'Đã quyết toán', done: args.settled },
    { label: 'Hết công nợ NCC', done: args.nccPaid },
  ];
}

/** Thanh "độ hoàn thiện hồ sơ" — % + tooltip liệt kê việc còn thiếu. */
function ProfileProgress({ steps, compact }: { steps: ProgressStep[]; compact?: boolean }) {
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);
  const color = pct >= 100 ? '#16a34a' : pct >= 60 ? '#0d7a6a' : pct >= 30 ? '#d97706' : '#94a3b8';
  const pending = steps.filter((s) => !s.done);
  return (
    <Tooltip arrow title={
      <Box>
        <Typography variant="caption" fontWeight={800}>Hoàn thiện {done}/{steps.length}</Typography>
        {steps.map((s) => (
          <Stack key={s.label} direction="row" spacing={0.5} alignItems="center">
            {s.done
              ? <CheckCircleOutlineIcon sx={{ fontSize: 13, color: '#86efac' }} />
              : <RadioButtonUncheckedIcon sx={{ fontSize: 13, color: '#fdba74' }} />}
            <Typography variant="caption">{s.label}</Typography>
          </Stack>
        ))}
      </Box>
    }>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: compact ? 110 : 150 }}>
        <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: 'rgba(15,58,74,0.10)', overflow: 'hidden' }}>
          <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: color, borderRadius: 3, transition: 'width .3s ease' }} />
        </Box>
        <Typography sx={{ fontSize: 11, fontWeight: 800, color, whiteSpace: 'nowrap' }}>
          {pct}%{!compact && pending.length > 0 ? ` · thiếu ${pending.length}` : ''}
        </Typography>
      </Stack>
    </Tooltip>
  );
}

const PEOPLE_GROUPS = [
  { key: 'collab', label: 'Cộng tác', color: '#0d7a6a', Icon: GroupAddIcon },
  { key: 'follow', label: 'Theo dõi', color: '#64748b', Icon: VisibilityIcon },
  { key: 'event', label: 'Nhân sự event', color: '#d97706', Icon: ConfirmationNumberOutlinedIcon },
] as const;

/** Dải chip nhân sự gọn (dùng trong dòng hồ sơ) — 3 nhóm có nhãn + màu riêng. */
function PeopleStrip({ collaborators, followers, eventStaff }: {
  collaborators?: Collaborator[]; followers?: Collaborator[]; eventStaff?: Collaborator[];
}) {
  const data: Record<string, Collaborator[] | undefined> = { collab: collaborators, follow: followers, event: eventStaff };
  const groups = PEOPLE_GROUPS.filter((g) => (data[g.key]?.length ?? 0) > 0);
  if (groups.length === 0) return null;
  return (
    <>
      {groups.map((g) => (
        <Stack key={g.key} direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="caption" sx={{ color: g.color, fontWeight: 700 }}>{g.label}:</Typography>
          {(data[g.key] ?? []).map((c) => (
            <Chip key={c.u} size="small"
              avatar={<Avatar sx={{ bgcolor: g.color, color: '#fff', fontSize: 10, fontWeight: 700 }}>{c.name.charAt(0)}</Avatar>}
              label={c.name}
              sx={{ height: 22, bgcolor: `${g.color}14`, color: g.color, fontWeight: 600 }} />
          ))}
        </Stack>
      ))}
    </>
  );
}

/** Chốt duyệt biên lợi thấp — tính biên lợi từ báo giá ĐANG MỞ; cần duyệt nếu dưới ngưỡng. */
function MarginGuardPanel({ profile }: { profile: TourProfile }) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const draft = useQuoteStore((s) => s.draft);
  const requestMargin = useTourProfileStore((s) => s.requestMarginApproval);
  const approveMargin = useTourProfileStore((s) => s.approveMargin);
  const rejectMargin = useTourProfileStore((s) => s.rejectMargin);
  const [approver, setApprover] = useState<User | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const isStd = draft.template === 'domestic' || draft.template === 'intl';
  const totals = isStd ? computeTotals(draft) : null;
  const marginPct = totals && totals.grandTotal > 0 ? (totals.totalProfit / totals.grandTotal) * 100 : null;
  if (marginPct === null) return null;

  const ap = profile.marginApproval;
  const status = marginGuard(marginPct, LOW_MARGIN_THRESHOLD, ap);
  if (status === 'ok') return null;

  const isApp = !!currentUser && isApprover(currentUser.role);
  const notify = async (toU: string, title: string, message: string) => {
    try {
      await sbSendNotification(toU, { type: 'announcement', priority: 'high', title, message, createdBy: currentUser?.name ?? '', link: { kind: 'tourProfile', id: profile.id, label: profile.code } });
    } catch { /* không chặn */ }
  };
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  const doApprove = () => run(async () => {
    if (ap) await approveMargin(profile.id);
    else await requestMargin(profile.id, { status: 'approved', marginPct, threshold: LOW_MARGIN_THRESHOLD, byU: currentUser!.u, byName: currentUser!.name, approverU: currentUser!.u, approverName: currentUser!.name, requestedAt: new Date().toISOString(), decidedAt: new Date().toISOString(), decidedByName: currentUser!.name });
    if (ap && ap.byU !== currentUser!.u) await notify(ap.byU, `✅ Biên lợi hồ sơ ${profile.code} đã được duyệt`, `Biên lợi ${marginPct.toFixed(1)}% đã được ${currentUser!.name} duyệt.`);
  });
  const doReject = () => run(async () => {
    await rejectMargin(profile.id);
    if (ap && ap.byU !== currentUser!.u) await notify(ap.byU, `❌ Biên lợi hồ sơ ${profile.code} bị từ chối`, `Yêu cầu duyệt biên lợi ${ap.marginPct.toFixed(1)}% đã bị từ chối.`);
  });
  const doRequest = () => run(async () => {
    if (!approver || !currentUser) return;
    await requestMargin(profile.id, { status: 'pending', marginPct, threshold: LOW_MARGIN_THRESHOLD, byU: currentUser.u, byName: currentUser.name, approverU: approver.u, approverName: approver.name, reason: reason.trim() || undefined, requestedAt: new Date().toISOString() });
    await notify(approver.u, `⚠️ Xin duyệt biên lợi thấp · hồ sơ ${profile.code}`, `${currentUser.name} xin duyệt biên lợi ${marginPct.toFixed(1)}% (dưới ${LOW_MARGIN_THRESHOLD}%).${reason.trim() ? ' Lý do: ' + reason.trim() : ''}`);
    setReason('');
  });

  const color = status === 'approved' ? '#16a34a' : '#dc2626';
  const approvers = users.filter((u) => isApprover(u.role));
  const canDecide = isApp || (!!currentUser && ap?.approverU === currentUser.u);

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, borderColor: `${color}55`, bgcolor: `${color}0d` }}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
        <GavelIcon sx={{ fontSize: 18, color }} />
        <Typography fontWeight={800} fontSize={13.5} sx={{ color }}>
          Biên lợi {marginPct.toFixed(1)}% {status === 'approved' ? '· đã duyệt' : `· dưới ngưỡng ${LOW_MARGIN_THRESHOLD}%`}
        </Typography>
      </Stack>
      {status === 'approved' ? (
        <Typography variant="caption" color="text.secondary">✓ Đã được {ap?.decidedByName ?? ap?.approverName} duyệt — có thể chốt.</Typography>
      ) : status === 'pending' ? (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="caption" sx={{ flex: 1, minWidth: 160 }}>
            ⏳ Chờ <strong>{ap?.approverName}</strong> duyệt (xin bởi {ap?.byName}{ap?.reason ? ` — “${ap.reason}”` : ''}).
          </Typography>
          {canDecide && (<>
            <Button size="small" color="success" variant="contained" disabled={busy} onClick={doApprove}>Duyệt</Button>
            <Button size="small" color="error" disabled={busy} onClick={doReject}>Từ chối</Button>
          </>)}
        </Stack>
      ) : isApp ? (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="caption" sx={{ flex: 1, minWidth: 160 }}>Biên lợi dưới ngưỡng — bạn có quyền duyệt để chốt.</Typography>
          <Button size="small" color="success" variant="contained" disabled={busy} onClick={doApprove}>Duyệt biên lợi</Button>
          <Button size="small" color="error" disabled={busy} onClick={doReject}>Từ chối</Button>
        </Stack>
      ) : (
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="caption" sx={{ width: '100%' }}>Cần Trưởng Phòng/BGĐ duyệt trước khi chốt.</Typography>
          <Autocomplete size="small" sx={{ flex: 1, minWidth: 160 }} options={approvers} value={approver}
            onChange={(_, v) => setApprover(v)} getOptionLabel={(u) => userLabel(u, currentUser)}
            isOptionEqualToValue={(a, b) => a.u === b.u}
            renderInput={(pr) => <TextField {...pr} placeholder="Chọn người duyệt…" />} />
          <TextField size="small" sx={{ flex: 1, minWidth: 140 }} placeholder="Lý do (tuỳ chọn)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="small" variant="contained" disabled={busy || !approver} onClick={doRequest} sx={{ background: LEGACY.headerGradient }}>Gửi duyệt</Button>
        </Stack>
      )}
    </Paper>
  );
}

/** Chip gọn "⚠ Cần chú ý (N)" trên thẻ hồ sơ — tooltip liệt kê chi tiết. */
function RiskChip({ risks }: { risks: TourRisk[] }) {
  const level = topRiskLevel(risks);
  if (!level) return null;
  const color = RISK_COLOR[level];
  return (
    <Tooltip title={<Box>{risks.map((r) => <Typography key={r.key} variant="caption" sx={{ display: 'block' }}>• {r.label}</Typography>)}</Box>}>
      <Chip size="small" icon={<ReportProblemOutlinedIcon sx={{ fontSize: 14, color: `${color} !important` }} />}
        label={`Cần chú ý (${risks.length})`}
        sx={{ height: 20, bgcolor: `${color}1a`, color, fontWeight: 800 }} />
    </Tooltip>
  );
}

/** Bảng liệt kê cảnh báo "cần chú ý" ở màn chi tiết hồ sơ. */
function RiskPanel({ risks }: { risks: TourRisk[] }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, borderColor: 'rgba(220,38,38,0.3)', bgcolor: 'rgba(220,38,38,0.03)' }}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
        <ReportProblemOutlinedIcon sx={{ fontSize: 18, color: '#dc2626' }} />
        <Typography fontWeight={800} fontSize={13.5}>Cần chú ý ({risks.length})</Typography>
      </Stack>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {risks.map((r) => (
          <Chip key={r.key} size="small" label={r.label}
            sx={{ height: 22, bgcolor: `${RISK_COLOR[r.level]}14`, color: RISK_COLOR[r.level], fontWeight: 700 }} />
        ))}
      </Stack>
    </Paper>
  );
}

/** Mốc thời gian & đếm ngược của hồ sơ (suy từ báo giá chính). */
function MilestonePanel({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) return null;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
        <FlagOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography fontWeight={800} fontSize={13.5}>Mốc thời gian</Typography>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(3,1fr)', md: 'repeat(5,1fr)' }, gap: 1 }}>
        {milestones.map((m) => {
          const color = MILESTONE_COLOR[m.level];
          return (
            <Box key={m.key} sx={{ p: 0.75, borderRadius: 1.5, border: `1px solid ${color}33`, bgcolor: `${color}0d` }}>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', lineHeight: 1.2 }}>{m.label}</Typography>
              <Typography fontSize={13} fontWeight={800} sx={{ color, lineHeight: 1.2 }}>{countdownLabel(m)}</Typography>
              <Typography variant="caption" color="text.secondary">{new Date(m.date).toLocaleDateString('vi-VN')}</Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

/** Nhãn (tag) tự do của hồ sơ — thêm/gỡ (gate canEdit). */
function TagEditor({ profile, canEdit }: { profile: TourProfile; canEdit: boolean }) {
  const setTags = useTourProfileStore((s) => s.setTags);
  const [input, setInput] = useState('');
  const tags = profile.tags ?? [];
  const add = () => {
    const t = input.trim();
    if (!t || tags.includes(t)) { setInput(''); return; }
    void setTags(profile.id, [...tags, t]);
    setInput('');
  };
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mt: 2 }}>
      <Typography fontWeight={800} fontSize={13.5} sx={{ mb: 0.75 }}># Nhãn ({tags.length})</Typography>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: canEdit ? 1 : 0 }}>
        {tags.length === 0 && <Typography variant="body2" color="text.secondary">Chưa có nhãn.</Typography>}
        {tags.map((t) => (
          <Chip key={t} size="small" label={t}
            onDelete={canEdit ? () => void setTags(profile.id, tags.filter((x) => x !== t)) : undefined}
            sx={{ bgcolor: 'rgba(124,58,237,0.1)', color: '#7c3aed' }} />
        ))}
      </Stack>
      {canEdit && (
        <Stack direction="row" spacing={0.75} alignItems="center">
          <TextField size="small" sx={{ flex: 1, maxWidth: 280 }} placeholder="Thêm nhãn (VIP, lặp lại, cần gấp…) — Enter"
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <Button size="small" variant="outlined" disabled={!input.trim()} onClick={add}>+ Nhãn</Button>
        </Stack>
      )}
    </Paper>
  );
}

/** Trung tâm tài liệu cấp hồ sơ — upload R2 + xem trước + gỡ (gate canShare). */
function DocumentHub({ profile, canEdit }: { profile: TourProfile; canEdit: boolean }) {
  const me = useAuthStore((s) => s.currentUser);
  const addDocuments = useTourProfileStore((s) => s.addDocuments);
  const removeDocument = useTourProfileStore((s) => s.removeDocument);
  const [uploading, setUploading] = useState(false);
  const docs = profile.documents ?? [];

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      const at = new Date().toISOString();
      const uploaded: FileAttachment[] = (await Promise.all(files.map((f) => uploadFileToWorker(f))))
        .map((u) => ({ ...u, uploadedBy: me?.name ?? '', uploadedAt: at }));
      await addDocuments(profile.id, uploaded);
    } catch (err) {
      window.alert('❌ Tải file lỗi: ' + (err as Error).message);
    } finally { setUploading(false); }
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mt: 2 }}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
        <FolderOpenOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography fontWeight={800} fontSize={13.5}>Tài liệu hồ sơ ({docs.length})</Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Gom HĐ scan / vé / voucher / ảnh đoàn… theo tour. File lưu trên R2 qua AI Worker.
      </Typography>
      <Stack spacing={0.5} sx={{ mb: 1 }}>
        {docs.length === 0 && <Typography variant="body2" color="text.secondary">Chưa có tài liệu nào.</Typography>}
        {docs.map((d) => (
          <Stack key={d.key} direction="row" alignItems="center" spacing={1}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: 0.5 }}>
            <InsertDriveFileOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            <Box component="button" type="button" onClick={() => openFilePreview({ key: d.key, name: d.name })}
              sx={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', p: 0, fontFamily: 'inherit', fontSize: 13, color: '#0d7a6a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.name}
              {d.uploadedBy ? <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.disabled' }}>· {d.uploadedBy}</Typography> : null}
            </Box>
            {canEdit && (
              <IconButton size="small" color="error" onClick={() => void removeDocument(profile.id, d.key)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>
        ))}
      </Stack>
      {canEdit && (
        <Button component="label" size="small" startIcon={<AttachFileIcon />} disabled={uploading} sx={{ color: '#0d7a6a' }}>
          {uploading ? 'Đang tải lên…' : 'Đính kèm tài liệu (PDF/Word/ảnh…)'}
          <input type="file" hidden multiple onChange={(e) => void onPick(e)} />
        </Button>
      )}
    </Paper>
  );
}

/** Lịch khởi hành — lưới tháng, mỗi ngày hiện các tour khởi hành. */
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
function DepartureCalendar({ rows, onOpen }: { rows: DepartureRow[]; onOpen: (id: string) => void }) {
  const today = new Date();
  const [anchor, setAnchor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const byDay = useMemo(() => groupByDepartureDay(rows), [rows]);
  const y = anchor.getFullYear(), mo = anchor.getMonth();
  const first = new Date(y, mo, 1);
  const lead = (first.getDay() + 6) % 7; // T2 đầu tuần
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const dayKey = (d: number) => `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const isToday = (d: number) => today.getFullYear() === y && today.getMonth() === mo && today.getDate() === d;
  const totalMonth = Object.entries(byDay).filter(([k]) => k.startsWith(`${y}-${String(mo + 1).padStart(2, '0')}`)).reduce((a, [, v]) => a + v.length, 0);

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <IconButton size="small" onClick={() => setAnchor(new Date(y, mo - 1, 1))}><ChevronLeftIcon /></IconButton>
        <Stack alignItems="center">
          <Typography fontWeight={900} fontSize={15}>Tháng {mo + 1}/{y}</Typography>
          <Typography variant="caption" color="text.secondary">{totalMonth} tour khởi hành</Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Button size="small" onClick={() => setAnchor(new Date(today.getFullYear(), today.getMonth(), 1))}>Hôm nay</Button>
          <IconButton size="small" onClick={() => setAnchor(new Date(y, mo + 1, 1))}><ChevronRightIcon /></IconButton>
        </Stack>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 0.5 }}>
        {WEEKDAYS.map((w) => (
          <Typography key={w} variant="caption" fontWeight={800} color="text.secondary" sx={{ textAlign: 'center', py: 0.25 }}>{w}</Typography>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <Box key={`b${i}`} sx={{ minHeight: 64, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.015)' }} />;
          const items = byDay[dayKey(d)] ?? [];
          return (
            <Box key={d} sx={{ minHeight: 64, p: 0.5, borderRadius: 1, border: '1px solid', borderColor: isToday(d) ? '#0d7a6a' : 'rgba(15,58,74,0.1)', bgcolor: isToday(d) ? 'rgba(13,122,106,0.06)' : 'transparent' }}>
              <Typography variant="caption" fontWeight={isToday(d) ? 900 : 600} sx={{ color: isToday(d) ? '#0d7a6a' : 'text.secondary' }}>{d}</Typography>
              <Stack spacing={0.25} sx={{ mt: 0.25 }}>
                {items.slice(0, 3).map((it) => {
                  const sm = STAGE_META(it.stage as DealStage);
                  return (
                    <Box key={it.id} component="button" type="button" onClick={() => onOpen(it.id)}
                      title={`${it.code} — ${it.name}`}
                      sx={{ border: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 0.5, px: 0.5, py: 0.1, bgcolor: `${sm.color}1a`, color: sm.color, fontSize: 10.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                      {it.code}
                    </Box>
                  );
                })}
                {items.length > 3 && <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>+{items.length - 3} nữa</Typography>}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

/** So sánh các phương án báo giá trong cùng hồ sơ (từ chỉ mục, không tải full). */
function CompareOptionsPanel({ options, primaryId, showPrice, currentId, onOpen }: {
  options: CloudQuoteEntry[]; primaryId?: string; showPrice: boolean; currentId?: string;
  onOpen: (cloudId: string) => void;
}) {
  if (options.length < 2) return null;
  const fmtStatus = (s?: CloudQuoteEntry['status']) => STAGE_META(dealStage({ status: s, departureISO: undefined })).short;
  const rows: { label: string; cell: (q: CloudQuoteEntry) => string; show: boolean }[] = [
    { label: 'Số khách', cell: (q: CloudQuoteEntry) => String(q.pax ?? 0), show: true },
    { label: 'Giá trị', cell: (q: CloudQuoteEntry) => fmtVND(q.totalCost ?? 0), show: showPrice },
    { label: 'Công nợ còn lại', cell: (q: CloudQuoteEntry) => fmtVND(q.paymentSummary?.remaining ?? 0), show: showPrice },
    { label: 'Biên lợi thực', cell: (q: CloudQuoteEntry) => (typeof q.settlementSummary?.actualProfit === 'number' ? fmtVND(q.settlementSummary.actualProfit) : '—'), show: showPrice },
    { label: 'Trạng thái', cell: (q: CloudQuoteEntry) => fmtStatus(q.status), show: true },
  ].filter((r) => r.show);
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mt: 2, overflowX: 'auto' }}>
      <Typography fontWeight={800} fontSize={13.5} sx={{ mb: 1 }}>⚖️ So sánh phương án báo giá ({options.length})</Typography>
      <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', minWidth: 360, '& td, & th': { border: '1px solid rgba(15,58,74,0.12)', p: 0.75, textAlign: 'left', fontSize: 12.5 } }}>
        <thead>
          <Box component="tr">
            <Box component="th" sx={{ bgcolor: 'rgba(0,0,0,0.03)' }} />
            {options.map((q) => (
              <Box component="th" key={q.cloudId} sx={{ bgcolor: q.cloudId === currentId ? 'rgba(13,122,106,0.1)' : 'rgba(0,0,0,0.03)' }}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography fontSize={12.5} fontWeight={800} noWrap>{q.cloudId === primaryId ? '★ ' : ''}{q.name}</Typography>
                  <Button size="small" sx={{ minWidth: 0, p: 0.25 }} onClick={() => onOpen(q.cloudId)}>Mở</Button>
                </Stack>
              </Box>
            ))}
          </Box>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Box component="tr" key={r.label}>
              <Box component="td" sx={{ fontWeight: 700, color: 'text.secondary', whiteSpace: 'nowrap' }}>{r.label}</Box>
              {options.map((q) => <Box component="td" key={q.cloudId}>{r.cell(q)}</Box>)}
            </Box>
          ))}
        </tbody>
      </Box>
    </Paper>
  );
}

/** Khách hàng 360 — toàn bộ tour của khách hiện tại + tổng quan. */
function CustomerPortfolioPanel({ portfolio, currentId, showPrice, onOpen }: {
  portfolio: CustomerPortfolio; currentId: string; showPrice: boolean; onOpen: (id: string) => void;
}) {
  if (!portfolio.customer || portfolio.count === 0) return null;
  const others = portfolio.items.filter((i) => i.id !== currentId);
  const stats: { label: string; value: string; color?: string }[] = [
    { label: 'Hồ sơ', value: String(portfolio.count) },
    { label: 'Đã chốt', value: String(portfolio.won), color: '#0d7a6a' },
    { label: 'Thua / Huỷ', value: String(portfolio.lost), color: '#dc2626' },
  ];
  if (showPrice) {
    stats.push({ label: 'Tổng giá trị', value: fmtVND(portfolio.totalValue) });
    if (portfolio.profitN > 0) stats.push({ label: `Biên lợi thực (${portfolio.profitN})`, value: fmtVND(portfolio.totalProfit), color: portfolio.totalProfit >= 0 ? '#16a34a' : '#dc2626' });
  }
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mt: 2 }}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
        <PersonOutlineIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography fontWeight={800} fontSize={13.5}>Khách hàng 360 · {portfolio.customer}</Typography>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3,1fr)', sm: 'repeat(5,1fr)' }, gap: 1, mb: 1 }}>
        {stats.map((s) => (
          <Box key={s.label} sx={{ textAlign: 'center', p: 0.75, borderRadius: 1.5, bgcolor: 'rgba(0,0,0,0.02)' }}>
            <Typography fontSize={15} fontWeight={900} sx={{ color: s.color ?? 'text.primary', lineHeight: 1.1 }}>{s.value}</Typography>
            <Typography variant="caption" color="text.secondary">{s.label}</Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="caption" fontWeight={800} color="text.secondary">Các tour khác của khách ({others.length})</Typography>
      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        {others.length === 0 && <Typography variant="body2" color="text.secondary">Đây là hồ sơ duy nhất của khách này.</Typography>}
        {others.map((o) => {
          const sm = STAGE_META(o.stage as DealStage);
          return (
            <Stack key={o.id} direction="row" alignItems="center" spacing={1}
              sx={{ border: '1px solid rgba(15,58,74,0.12)', borderRadius: 1.5, px: 1, py: 0.5 }}>
              <Chip size="small" label={o.code} sx={{ height: 20, fontWeight: 800, bgcolor: 'rgba(13,122,106,0.1)', color: '#0d7a6a' }} />
              <Typography fontSize={13} fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0 }}>{o.name || '(chưa đặt tên)'}</Typography>
              <Chip size="small" label={sm.short} sx={{ height: 20, bgcolor: `${sm.color}1a`, color: sm.color, fontWeight: 700 }} />
              {showPrice && typeof o.value === 'number' && <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{fmtVND(o.value)}</Typography>}
              <Button size="small" onClick={() => onOpen(o.id)}>Mở</Button>
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}

/** Dòng thời gian hoạt động của hồ sơ — đọc audit_log, lọc theo hồ sơ. */
function ProfileTimeline({ profile }: { profile: TourProfile }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const unsub = sbSubscribeAuditLog((e) => { setEntries(e); setLoaded(true); });
    return () => unsub();
  }, []);
  const items = useMemo(() => tourProfileTimeline(entries, profile).slice(0, 40), [entries, profile]);
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
        <HistoryIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography fontWeight={800} fontSize={13.5}>Dòng thời gian hoạt động</Typography>
      </Stack>
      {!loaded ? (
        <Typography variant="body2" color="text.secondary">Đang tải…</Typography>
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">Chưa có hoạt động nào được ghi.</Typography>
      ) : (
        <Stack spacing={1}>
          {items.map((e) => {
            const am = ACTION_META[e.action];
            return (
              <Stack key={e.id} direction="row" spacing={1} alignItems="flex-start">
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: am.color, mt: 0.6, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography fontSize={12.5} fontWeight={600} noWrap>
                    {e.note || am.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {e.byName} · {new Date(e.at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                </Box>
              </Stack>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}

/** Thảo luận theo hồ sơ — luồng bình luận chung cho nhóm (creator/collab/follow/event). */
function ProfileDiscussion({ profile, users, currentUser }: { profile: TourProfile; users: User[]; currentUser: User | null }) {
  const threadId = `tp_${profile.id}`;
  const [thread, setThread] = useState<NotifThread | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  // Thành viên luồng = chủ sở hữu + cộng tác + theo dõi + nhân sự event.
  const members = useMemo(() => {
    const set = new Set<string>();
    if (profile.createdByU) set.add(profile.createdByU);
    for (const c of [...(profile.collaborators ?? []), ...(profile.followers ?? []), ...(profile.eventStaff ?? [])]) set.add(c.u);
    return [...set];
  }, [profile]);

  useEffect(() => {
    let alive = true;
    void sbEnsureNotifThread({
      id: threadId,
      title: `Hồ sơ tour ${profile.code}`,
      members,
      link: { kind: 'tourProfile', id: profile.id, label: profile.code },
      comments: [],
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name ?? '',
      actType: 'collab_comment',
    }).catch(() => { /* không chặn */ });
    const unsub = sbSubscribeNotifThread(threadId, (t) => { if (alive) setThread(t); });
    return () => { alive = false; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, members.join(',')]);

  const nameOf = (u: string) => users.find((x) => x.u === u)?.name ?? u;

  const send = async () => {
    const body = text.trim();
    if (!body || !currentUser) return;
    setBusy(true);
    const c: NotifComment = { id: genCommentId(), by: currentUser.u, byName: currentUser.name, text: body, at: new Date().toISOString() };
    try {
      await sbAddThreadComment(threadId, c);
      const others = members.filter((u) => u !== currentUser.u);
      if (others.length) {
        await sbSendNotificationMany(others, {
          type: 'collab_comment',
          title: `💬 Bình luận mới · hồ sơ ${profile.code}`,
          message: `${currentUser.name}: ${body.slice(0, 140)}`,
          createdBy: currentUser.name,
          link: { kind: 'tourProfile', id: profile.id, label: profile.code },
          threadId,
        }).catch(() => { /* thông báo không chặn */ });
      }
      setText('');
    } catch (e) {
      window.alert('❌ ' + (e as Error).message);
    } finally { setBusy(false); }
  };

  const comments = thread?.comments ?? [];
  return (
    <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
        <ForumOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography fontWeight={800} fontSize={13.5}>Thảo luận ({comments.length})</Typography>
      </Stack>
      <Stack spacing={1} sx={{ maxHeight: 260, overflowY: 'auto', mb: 1 }}>
        {comments.length === 0 && <Typography variant="body2" color="text.secondary">Chưa có bình luận. Bắt đầu trao đổi với nhóm hồ sơ.</Typography>}
        {comments.map((c) => (
          <Box key={c.id} sx={{ bgcolor: 'rgba(0,0,0,0.03)', borderRadius: 1.5, px: 1, py: 0.5 }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary">
              {nameOf(c.by)} · {new Date(c.at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </Typography>
            <Typography fontSize={13} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</Typography>
          </Box>
        ))}
      </Stack>
      <Stack direction="row" spacing={0.75} alignItems="flex-end">
        <TextField size="small" fullWidth multiline maxRows={4} placeholder="Viết bình luận… (⌘/Ctrl+Enter để gửi)"
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send(); }} />
        <IconButton color="primary" disabled={busy || !text.trim()} onClick={() => void send()}><SendIcon /></IconButton>
      </Stack>
    </Paper>
  );
}

type LinkItem = { id: string; label: string; sub?: string; tourProfileId?: string | null };

/** Gắn TRỰC TIẾP thực đơn/chương trình/visa/HĐ vào hồ sơ (set tourProfileId) —
 *  dùng được kể cả khi tour CHƯA có báo giá nào. */
function DirectLinkPanel({ profile }: { profile: TourProfile }) {
  const user = useAuthStore((s) => s.currentUser);
  const savedBy = user ? `${user.name} (${user.role})` : '';
  const menus = useMenuStore((s) => s.list);
  const itineraries = useItineraryStore((s) => s.list);
  const visaProjects = useVisaProjectStore((s) => s.projects);
  const contracts = useContractStore((s) => s.contracts);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { window.alert('❌ ' + (e as Error).message); } finally { setBusy(false); }
  };

  const setMenu = (id: string, on: boolean) => run(async () => {
    const full = await useMenuStore.getState().load(id);
    if (full) await useMenuStore.getState().save({ ...full, tourProfileId: on ? profile.id : null }, savedBy);
  });
  const setItin = (id: string, on: boolean) => run(async () => {
    const full = await useItineraryStore.getState().load(id);
    if (full) await useItineraryStore.getState().save({ ...full, tourProfileId: on ? profile.id : null }, savedBy);
  });
  const setVisa = (id: string, on: boolean) => run(async () => {
    const p = visaProjects.find((x) => x.id === id);
    if (p) await useVisaProjectStore.getState().save({ ...p, tourProfileId: on ? profile.id : null });
  });
  const setContract = (id: string, on: boolean) => run(async () => {
    const c = contracts.find((x) => x.id === id);
    if (c) await useContractStore.getState().save({ ...c, tourProfileId: on ? profile.id : null });
  });

  const sections: { title: string; items: LinkItem[]; set: (id: string, on: boolean) => void }[] = [
    { title: '🍽️ Thực đơn', set: setMenu, items: menus.map((m) => ({ id: m.id, label: m.title, sub: m.code, tourProfileId: m.tourProfileId })) },
    { title: '🗺️ Chương trình tour', set: setItin, items: itineraries.map((i) => ({ id: i.id, label: i.title, sub: i.code, tourProfileId: i.tourProfileId })) },
    { title: '🛂 Dự án visa', set: setVisa, items: visaProjects.map((v) => ({ id: v.id, label: v.name || v.code, sub: v.country, tourProfileId: v.tourProfileId })) },
    { title: '📜 Hợp đồng', set: setContract, items: contracts.map((c) => ({ id: c.id, label: c.tourName || c.contractNo, sub: c.contractNo, tourProfileId: c.tourProfileId })) },
  ];

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mt: 2 }}>
      <Typography fontWeight={800} fontSize={13.5} sx={{ mb: 0.5 }}>🔗 Gắn liên kết trực tiếp vào hồ sơ</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Gắn thực đơn / chương trình / visa / hợp đồng thẳng vào hồ sơ tour — dùng được kể cả khi chưa có báo giá.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
        {sections.map((s) => (
          <DirectLinkSection key={s.title} title={s.title} profileId={profile.id} items={s.items} busy={busy} onSet={s.set} />
        ))}
      </Box>
    </Paper>
  );
}

function DirectLinkSection({ title, profileId, items, busy, onSet }: {
  title: string; profileId: string; items: LinkItem[]; busy: boolean; onSet: (id: string, on: boolean) => void;
}) {
  const [pick, setPick] = useState<LinkItem | null>(null);
  const linked = items.filter((i) => i.tourProfileId === profileId);
  const options = items.filter((i) => i.tourProfileId !== profileId);
  return (
    <Box>
      <Typography fontWeight={700} fontSize={12.5} sx={{ mb: 0.5 }}>{title}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>({linked.length})</Typography>
      </Typography>
      <Stack spacing={0.5} sx={{ mb: 0.75 }}>
        {linked.map((o) => (
          <Stack key={o.id} direction="row" alignItems="center" spacing={1}
            sx={{ border: '1px solid rgba(13,122,106,0.25)', borderRadius: 1.5, px: 1, py: 0.25, bgcolor: 'rgba(13,122,106,0.06)' }}>
            <Typography fontSize={12.5} fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0 }}>{o.label}</Typography>
            <Button size="small" color="error" disabled={busy} onClick={() => onSet(o.id, false)} sx={{ minWidth: 0 }}>Gỡ</Button>
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" spacing={0.5}>
        <Autocomplete
          size="small" sx={{ flex: 1 }} options={options} value={pick}
          onChange={(_, v) => setPick(v)}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderOption={(props, o) => (<li {...props} key={o.id}><Box><Typography variant="body2">{o.label}</Typography>{o.sub && <Typography variant="caption" color="text.secondary">{o.sub}</Typography>}</Box></li>)}
          renderInput={(pr) => <TextField {...pr} placeholder="Chọn để gắn…" />}
        />
        <Button size="small" variant="outlined" disabled={busy || !pick} onClick={() => { if (pick) { onSet(pick.id, true); setPick(null); } }}>+ Gắn</Button>
      </Stack>
    </Box>
  );
}

/** Thêm Collab (sửa) / Follow (theo dõi + nhận thông báo) vào hồ sơ. */
function ShareControl({ profile, users, currentUser, canShare }: {
  profile: TourProfile; users: User[]; currentUser: User | null; canShare: boolean;
}) {
  const addCollaborator = useTourProfileStore((s) => s.addCollaborator);
  const addFollower = useTourProfileStore((s) => s.addFollower);
  const addEventStaff = useTourProfileStore((s) => s.addEventStaff);
  const removeEventStaff = useTourProfileStore((s) => s.removeEventStaff);
  const [pick, setPick] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);

  const taken = new Set([
    profile.createdByU,
    ...(profile.collaborators ?? []).map((c) => c.u),
    ...(profile.followers ?? []).map((c) => c.u),
    ...(profile.eventStaff ?? []).map((c) => c.u),
  ]);
  const options = users.filter((u) => !taken.has(u.u));

  const ROLE_TITLE: Record<'collab' | 'follow' | 'event', string> = {
    collab: `Bạn được thêm cộng tác hồ sơ tour ${profile.code}`,
    follow: `Bạn đang theo dõi hồ sơ tour ${profile.code}`,
    event: `Bạn là nhân sự event của hồ sơ tour ${profile.code}`,
  };
  const ROLE_VERB: Record<'collab' | 'follow' | 'event', string> = {
    collab: 'cộng tác (sửa được)', follow: 'theo dõi', event: 'làm nhân sự event',
  };

  const add = async (role: 'collab' | 'follow' | 'event') => {
    if (!pick) return;
    setBusy(true);
    const c: Collaborator = { u: pick.u, name: pick.name };
    try {
      if (role === 'collab') await addCollaborator(profile.id, c);
      else if (role === 'follow') await addFollower(profile.id, c);
      else await addEventStaff(profile.id, c);
      // Báo cho người được thêm — tái dùng notificationStore.
      try {
        await sbSendNotification(pick.u, {
          type: 'collab_invite',
          title: ROLE_TITLE[role],
          message: `${currentUser?.name ?? 'Ai đó'} đã thêm bạn ${ROLE_VERB[role]} hồ sơ "${profile.name || profile.code}".`,
          createdBy: currentUser?.name ?? '',
          link: { kind: 'tourProfile' as const, id: profile.id, label: profile.code },
        });
      } catch { /* thông báo không chặn */ }
      setPick(null);
    } finally { setBusy(false); }
  };

  const sectionData: Record<string, { items: Collaborator[]; onRemove?: (u: string) => void }> = {
    collab: { items: profile.collaborators ?? [] },
    follow: { items: profile.followers ?? [] },
    event: { items: profile.eventStaff ?? [], onRemove: canShare ? (u) => void removeEventStaff(profile.id, u) : undefined },
  };
  const anyPeople = PEOPLE_GROUPS.some((g) => sectionData[g.key].items.length > 0);

  return (
    <Box>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
        <GroupAddIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography variant="caption" fontWeight={800} color="text.secondary">Cộng tác · Theo dõi · Nhân sự event</Typography>
      </Stack>
      {!anyPeople && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>Chỉ mình bạn.</Typography>
      )}
      <Stack spacing={0.75} sx={{ mb: canShare ? 1 : 0 }}>
        {PEOPLE_GROUPS.map((g) => {
          const { items, onRemove } = sectionData[g.key];
          if (items.length === 0) return null;
          return (
            <Box key={g.key}
              sx={{ p: 0.75, borderRadius: 1.5, border: `1px solid ${g.color}33`, bgcolor: `${g.color}0a` }}>
              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                <g.Icon sx={{ fontSize: 15, color: g.color }} />
                <Typography variant="caption" sx={{ color: g.color, fontWeight: 800, minWidth: 88 }}>
                  {g.label} ({items.length})
                </Typography>
                {items.map((c) => (
                  <Chip key={c.u} size="small"
                    avatar={<Avatar sx={{ bgcolor: g.color, color: '#fff', fontSize: 10, fontWeight: 700 }}>{c.name.charAt(0)}</Avatar>}
                    label={c.name}
                    onDelete={onRemove ? () => onRemove(c.u) : undefined}
                    sx={{ height: 24, bgcolor: '#fff', border: `1px solid ${g.color}40`, color: g.color, fontWeight: 600 }} />
                ))}
              </Stack>
            </Box>
          );
        })}
      </Stack>
      {canShare ? (
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          <Autocomplete
            size="small" sx={{ flex: 1, minWidth: 160 }} options={options} value={pick}
            onChange={(_, v) => setPick(v)}
            getOptionLabel={(u) => userLabel(u, currentUser)}
            isOptionEqualToValue={(a, b) => a.u === b.u}
            renderInput={(pr) => <TextField {...pr} placeholder="Chọn nhân sự để thêm…" />}
          />
          <Button size="small" variant="outlined" disabled={!pick || busy} onClick={() => void add('collab')}
            sx={{ color: '#0d7a6a', borderColor: '#0d7a6a55' }}>+ Cộng tác</Button>
          <Button size="small" variant="outlined" disabled={!pick || busy} onClick={() => void add('follow')}
            sx={{ color: '#64748b', borderColor: '#64748b55' }}>+ Theo dõi</Button>
          <Button size="small" variant="outlined" disabled={!pick || busy} onClick={() => void add('event')}
            sx={{ color: '#d97706', borderColor: '#d9770655' }}>+ Nhân sự event</Button>
        </Stack>
      ) : (
        <Typography variant="caption" color="text.disabled">Chỉ người tạo / Trưởng phòng / BGĐ mới thêm được cộng tác.</Typography>
      )}
    </Box>
  );
}
