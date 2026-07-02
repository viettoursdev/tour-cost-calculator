import { Suspense, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { lazyView as lazy } from '@/lib/lazyView';
import { ChunkErrorBoundary } from '@/components/shell/ChunkErrorBoundary';
import { TemplateSelectorModal } from './TemplateSelectorModal';
import { NewQuoteDialog } from './NewQuoteDialog';
import { QuoteToolbar } from './QuoteToolbar';
import { HomeView } from './HomeView';
import { CostView } from './CostView';
import { SummaryView } from './SummaryView';
import { SaveCloudQuoteModal } from './SaveCloudQuoteModal';
import { useQuoteStore } from '@/stores/quoteStore';
import { useAuthStore } from '@/stores/authStore';
import { canSeePrices } from '@/auth/quotePerms';
import { LEGACY } from '@/theme';

// Tách bundle: các view phụ + app mẫu (itinerary/menu/visa/doctranslate) chỉ tải
// khi thực sự mở → giảm mạnh bundle khởi động (giữ nguyên Home/Cost/Summary eager).
const DashboardView = lazy(() => import('./DashboardView').then((m) => ({ default: m.DashboardView })));
const AdvanceView = lazy(() => import('./AdvanceView').then((m) => ({ default: m.AdvanceView })));
const PaymentView = lazy(() => import('./PaymentView').then((m) => ({ default: m.PaymentView })));
const SettlementView = lazy(() => import('./SettlementView').then((m) => ({ default: m.SettlementView })));
const QuoteHistoryView = lazy(() => import('./QuoteHistoryView').then((m) => ({ default: m.QuoteHistoryView })));
const FlightView = lazy(() => import('./FlightView').then((m) => ({ default: m.FlightView })));
const FlightSearchView = lazy(() => import('@/components/flightsearch/FlightSearchView').then((m) => ({ default: m.FlightSearchView })));
const WorkflowView = lazy(() => import('./WorkflowView').then((m) => ({ default: m.WorkflowView })));
const TourProfilesView = lazy(() => import('./TourProfilesView').then((m) => ({ default: m.TourProfilesView })));
const PassengerView = lazy(() => import('./PassengerView').then((m) => ({ default: m.PassengerView })));
const WorkflowBoard = lazy(() => import('./WorkflowBoard').then((m) => ({ default: m.WorkflowBoard })));
const ProcessHub = lazy(() => import('@/components/process/ProcessHub').then((m) => ({ default: m.ProcessHub })));
const DepartureCalendar = lazy(() => import('./DepartureCalendar').then((m) => ({ default: m.DepartureCalendar })));
const PaymentBoard = lazy(() => import('./PaymentBoard').then((m) => ({ default: m.PaymentBoard })));
const SalesPipeline = lazy(() => import('./SalesPipeline').then((m) => ({ default: m.SalesPipeline })));
const SalesAnalytics = lazy(() => import('./SalesAnalytics').then((m) => ({ default: m.SalesAnalytics })));
const ExecBoard = lazy(() => import('./ExecBoard').then((m) => ({ default: m.ExecBoard })));
const LockedQuoteView = lazy(() => import('./LockedQuoteView').then((m) => ({ default: m.LockedQuoteView })));
const AIQuoteImportDialog = lazy(() => import('./AIQuoteImportDialog').then((m) => ({ default: m.AIQuoteImportDialog })));
const AuditView = lazy(() => import('@/components/admin/AuditView').then((m) => ({ default: m.AuditView })));
const ContractView = lazy(() => import('@/components/contract/ContractView').then((m) => ({ default: m.ContractView })));
const CustomerView = lazy(() => import('@/components/customer/CustomerView').then((m) => ({ default: m.CustomerView })));
const NCCView = lazy(() => import('@/components/ncc/NCCView').then((m) => ({ default: m.NCCView })));
const NccProductView = lazy(() => import('@/components/ncc/NccProductView').then((m) => ({ default: m.NccProductView })));
const HRView = lazy(() => import('@/components/hr/HRView').then((m) => ({ default: m.HRView })));
const AdvanceSettlementView = lazy(() => import('./AdvanceSettlementView').then((m) => ({ default: m.AdvanceSettlementView })));
const TodoView = lazy(() => import('@/components/todo/TodoView').then((m) => ({ default: m.TodoView })));
const TourVisaPanel = lazy(() => import('./TourVisaPanel').then((m) => ({ default: m.TourVisaPanel })));
const InventoryView = lazy(() => import('@/components/inventory/InventoryView').then((m) => ({ default: m.InventoryView })));
const TrainingView = lazy(() => import('@/components/training/TrainingView').then((m) => ({ default: m.TrainingView })));
const KnowledgeView = lazy(() => import('@/components/knowledge/KnowledgeView').then((m) => ({ default: m.KnowledgeView })));
const ItineraryApp = lazy(() => import('@/components/itinerary/ItineraryApp').then((m) => ({ default: m.ItineraryApp })));
const MenuApp = lazy(() => import('@/components/menu/MenuApp').then((m) => ({ default: m.MenuApp })));
const VisaApp = lazy(() => import('@/components/visa/VisaApp').then((m) => ({ default: m.VisaApp })));
const DocTranslateApp = lazy(() => import('@/components/doctranslate/DocTranslateApp').then((m) => ({ default: m.DocTranslateApp })));
const GuideScheduleApp = lazy(() => import('@/components/guide/GuideScheduleApp').then((m) => ({ default: m.GuideScheduleApp })));

const ViewFallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
    <CircularProgress size={28} sx={{ color: '#14a08c' }} />
  </Box>
);

export function QuoteView() {
  const template = useQuoteStore((s) => s.draft.template);
  const rawView = useQuoteStore((s) => s.view);
  const currentUser = useAuthStore((s) => s.currentUser);
  // Phòng HDV bị ẩn giá: nếu draft còn lưu view thuần về giá thì ép về "Báo giá".
  const hidePrice = !canSeePrices(currentUser);
  const view = (hidePrice && (rawView === 'summary' || rawView === 'dashboard' || rawView === 'payment' || rawView === 'payboard' || rawView === 'settlement'))
    // "Visa của tour" chỉ dành cho báo giá nước ngoài — đổi báo giá khác thì về "Báo giá".
    || (rawView === 'tourvisa' && template !== 'intl')
    ? 'cost'
    : rawView;
  // `currentUsername` is null until `quoteStore.init(user)` has run from
  // MainApp's post-commit effect. Without this guard, the first render after
  // login sees the placeholder `template: null` from EMPTY_DRAFT and briefly
  // opens the fullScreen template-selector Dialog, which then immediately
  // closes when init sets template from localStorage. That rapid open→close
  // leaves MUI's Dialog wrapper stuck mounted at z-index 1300 (backdrop
  // opacity 0, visibility hidden) covering the whole page and eating clicks.
  const hydrated = useQuoteStore((s) => s.currentUsername !== null);
  const cloudDirty = useQuoteStore((s) => s.cloudDirty);
  const locked = useQuoteStore((s) => s.draft.locked);
  const newDraft = useQuoteStore((s) => s.newDraft);
  // "Bạn muốn tạo gì hôm nay?" mở từ store nên logo header (AppShell) cũng mở được.
  const selectorOpen = useQuoteStore((s) => s.selectorOpen);
  const openSelector = useQuoteStore((s) => s.openSelector);
  const closeSelector = useQuoteStore((s) => s.closeSelector);
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);
  const [saveCloudOpen, setSaveCloudOpen] = useState(false);
  const [aiImportFile, setAiImportFile] = useState<File | null>(null);

  // If no template, show the gate non-dismissably.
  const gateOpen = hydrated && (template === null || selectorOpen);
  const gateDismissable = template !== null;

  if (template === 'itinerary' || template === 'menu' || template === 'visa' || template === 'doctranslate' || template === 'guideschedule') {
    const exit = () => useQuoteStore.getState().abandon();
    return (
      <ChunkErrorBoundary key={template}>
      <Suspense fallback={<ViewFallback />}>
        {template === 'itinerary' && <ItineraryApp onExit={exit} />}
        {template === 'menu' && <MenuApp onExit={exit} />}
        {template === 'visa' && <VisaApp onExit={exit} />}
        {template === 'doctranslate' && <DocTranslateApp onExit={exit} />}
        {template === 'guideschedule' && <GuideScheduleApp onExit={exit} />}
      </Suspense>
      </ChunkErrorBoundary>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', background: LEGACY.pageBg }}>
      <TemplateSelectorModal
        open={gateOpen}
        canCancel={gateDismissable}
        onClose={closeSelector}
      />

      {template !== null && (
        <>
          <QuoteToolbar
            onOpenSelector={openSelector}
            onOpenNewQuote={() => setNewQuoteOpen(true)}
            onOpenSaveCloud={() => setSaveCloudOpen(true)}
          />

          <Box sx={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
           <ChunkErrorBoundary key={view}>
           <Suspense fallback={<ViewFallback />}>
            {view === 'home' && <HomeView />}
            {view === 'cost' && (locked ? <LockedQuoteView /> : <CostView />)}
            {view === 'summary' && <SummaryView />}
            {view === 'dashboard' && <DashboardView />}
            {view === 'advance' && <AdvanceView />}
            {view === 'advsettle' && <AdvanceSettlementView />}
            {view === 'payment' && <PaymentView />}
            {view === 'settlement' && <SettlementView />}
            {view === 'flights' && <FlightView />}
            {view === 'flightsearch' && <FlightSearchView />}
            {view === 'cockpit' && <TourProfilesView />}
            {view === 'workflow' && <WorkflowView />}
            {view === 'passengers' && <PassengerView />}
            {view === 'opsboard' && <WorkflowBoard />}
            {view === 'process' && <ProcessHub />}
            {view === 'departures' && <DepartureCalendar />}
            {view === 'payboard' && <PaymentBoard />}
            {view === 'pipeline' && <SalesPipeline />}
            {view === 'salesanalytics' && <SalesAnalytics />}
            {view === 'execboard' && <ExecBoard />}
            {view === 'audit' && <AuditView />}
            {view === 'history' && <QuoteHistoryView />}
            {view === 'contract' && <ContractView />}
            {view === 'customer' && <CustomerView />}
            {view === 'ncc' && <NCCView />}
            {view === 'nccProducts' && <NccProductView />}
            {view === 'hr' && <HRView />}
            {view === 'todo' && <TodoView />}
            {view === 'tourvisa' && <TourVisaPanel />}
            {view === 'inventory' && <InventoryView />}
            {view === 'training' && <TrainingView />}
            {view === 'library' && <KnowledgeView />}
           </Suspense>
           </ChunkErrorBoundary>
          </Box>

          {/* "Báo giá mới" trong sheet nội địa/nước ngoài → mở thẳng bảng nhập
              thông tin (không quay về màn chọn loại hồ sơ). */}
          {newQuoteOpen && (template === 'domestic' || template === 'intl') && (
            <NewQuoteDialog
              open
              initialTemplate={template}
              onClose={() => setNewQuoteOpen(false)}
              onConfirm={(tpl, meta, opts) => {
                if (cloudDirty && !window.confirm('Báo giá hiện tại có thay đổi chưa lưu sẽ bị thay thế. Tiếp tục?')) return;
                newDraft(tpl, meta);
                setNewQuoteOpen(false);
                // Upload Excel + AI → tự mở hộp thoại AI với file vừa upload.
                if (opts.mode === 'ai' && opts.file) setAiImportFile(opts.file);
              }}
            />
          )}

          {aiImportFile && (
            <Suspense fallback={null}>
              <AIQuoteImportDialog open initialFile={aiImportFile} onClose={() => setAiImportFile(null)} />
            </Suspense>
          )}

          <SaveCloudQuoteModal
            open={saveCloudOpen}
            onClose={() => setSaveCloudOpen(false)}
          />
        </>
      )}
    </Box>
  );
}
