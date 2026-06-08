import { useState } from 'react';
import { Box, Drawer } from '@mui/material';
import { TemplateSelectorModal } from './TemplateSelectorModal';
import { QuoteToolbar } from './QuoteToolbar';
import { CostView } from './CostView';
import { SummaryView } from './SummaryView';
import { DashboardView } from './DashboardView';
import { QuoteHistoryView } from './QuoteHistoryView';
import { SaveCloudQuoteModal } from './SaveCloudQuoteModal';
import { HistPanel } from './HistPanel';
import { useQuoteStore } from '@/stores/quoteStore';

const HIST_DRAWER_WIDTH = 300;

export function QuoteView() {
  const template = useQuoteStore((s) => s.draft.template);
  const view = useQuoteStore((s) => s.view);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [saveCloudOpen, setSaveCloudOpen] = useState(false);

  // If no template, show the gate non-dismissably.
  const gateOpen = template === null || selectorOpen;
  const gateDismissable = template !== null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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

          <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              {view === 'cost' && <CostView />}
              {view === 'summary' && <SummaryView />}
              {view === 'dashboard' && <DashboardView />}
              {view === 'history' && <QuoteHistoryView />}
            </Box>

            {template !== 'dmc' && (
              <Drawer
                variant="permanent"
                anchor="right"
                sx={{
                  width: HIST_DRAWER_WIDTH,
                  flexShrink: 0,
                  display: { xs: 'none', md: 'block' },
                  '& .MuiDrawer-paper': {
                    width: HIST_DRAWER_WIDTH,
                    position: 'relative',
                    border: 'none',
                    borderLeft: '1px solid',
                    borderColor: 'divider',
                  },
                }}
              >
                <HistPanel />
              </Drawer>
            )}
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
