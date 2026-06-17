import { useState } from 'react';
import { Box } from '@mui/material';
import { TemplateSelectorModal } from './TemplateSelectorModal';
import { QuoteToolbar } from './QuoteToolbar';
import { CostView } from './CostView';
import { SummaryView } from './SummaryView';
import { DashboardView } from './DashboardView';
import { PaymentView } from './PaymentView';
import { ItineraryApp } from '@/components/itinerary/ItineraryApp';
import { MenuApp } from '@/components/menu/MenuApp';
import { VisaApp } from '@/components/visa/VisaApp';
import { DocTranslateApp } from '@/components/doctranslate/DocTranslateApp';
import { QuoteHistoryView } from './QuoteHistoryView';
import { SaveCloudQuoteModal } from './SaveCloudQuoteModal';
import { ContractView } from '@/components/contract/ContractView';
import { CustomerView } from '@/components/customer/CustomerView';
import { NCCView } from '@/components/ncc/NCCView';
import { NccProductView } from '@/components/ncc/NccProductView';
import { FlightView } from './FlightView';
import { WorkflowView } from './WorkflowView';
import { WorkflowBoard } from './WorkflowBoard';
import { DepartureCalendar } from './DepartureCalendar';
import { PaymentBoard } from './PaymentBoard';
import { SalesPipeline } from './SalesPipeline';
import { AuditView } from '@/components/admin/AuditView';
import { useQuoteStore } from '@/stores/quoteStore';
import { LEGACY } from '@/theme';

export function QuoteView() {
  const template = useQuoteStore((s) => s.draft.template);
  const view = useQuoteStore((s) => s.view);
  // `currentUsername` is null until `quoteStore.init(user)` has run from
  // MainApp's post-commit effect. Without this guard, the first render after
  // login sees the placeholder `template: null` from EMPTY_DRAFT and briefly
  // opens the fullScreen template-selector Dialog, which then immediately
  // closes when init sets template from localStorage. That rapid open→close
  // leaves MUI's Dialog wrapper stuck mounted at z-index 1300 (backdrop
  // opacity 0, visibility hidden) covering the whole page and eating clicks.
  const hydrated = useQuoteStore((s) => s.currentUsername !== null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [saveCloudOpen, setSaveCloudOpen] = useState(false);

  // If no template, show the gate non-dismissably.
  const gateOpen = hydrated && (template === null || selectorOpen);
  const gateDismissable = template !== null;

  if (template === 'itinerary') {
    return (
      <ItineraryApp onExit={() => useQuoteStore.getState().abandon()} />
    );
  }
  if (template === 'menu') {
    return (
      <MenuApp onExit={() => useQuoteStore.getState().abandon()} />
    );
  }
  if (template === 'visa') {
    return (
      <VisaApp onExit={() => useQuoteStore.getState().abandon()} />
    );
  }
  if (template === 'doctranslate') {
    return (
      <DocTranslateApp onExit={() => useQuoteStore.getState().abandon()} />
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', background: LEGACY.pageBg }}>
      <TemplateSelectorModal
        open={gateOpen}
        canCancel={gateDismissable}
        onClose={() => setSelectorOpen(false)}
      />

      {template !== null && (
        <>
          <QuoteToolbar
            onOpenSelector={() => setSelectorOpen(true)}
            onOpenSaveCloud={() => setSaveCloudOpen(true)}
          />

          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {view === 'cost' && <CostView />}
            {view === 'summary' && <SummaryView />}
            {view === 'dashboard' && <DashboardView />}
            {view === 'payment' && <PaymentView />}
            {view === 'flights' && <FlightView />}
            {view === 'workflow' && <WorkflowView />}
            {view === 'opsboard' && <WorkflowBoard />}
            {view === 'departures' && <DepartureCalendar />}
            {view === 'payboard' && <PaymentBoard />}
            {view === 'pipeline' && <SalesPipeline />}
            {view === 'audit' && <AuditView />}
            {view === 'history' && <QuoteHistoryView />}
            {view === 'contract' && <ContractView />}
            {view === 'customer' && <CustomerView />}
            {view === 'ncc' && <NCCView />}
            {view === 'nccProducts' && <NccProductView />}
          </Box>

          <SaveCloudQuoteModal
            open={saveCloudOpen}
            onClose={() => setSaveCloudOpen(false)}
          />
        </>
      )}
    </Box>
  );
}
