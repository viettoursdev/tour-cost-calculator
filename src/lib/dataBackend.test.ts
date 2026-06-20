import { describe, it, expect, vi, afterEach } from 'vitest';

// The full data-gateway surface the barrel must expose (75 names).
const NAMES = [
  'fbAddThreadComment','fbBackfillPaymentIndex','fbBackfillWorkflowIndex','fbDeleteChatMessage',
  'fbDeleteDMCQuote','fbDeleteItinerary','fbDeleteMenu','fbDeleteQuote','fbDeleteVisaProc',
  'fbEditChatMessage','fbEnsureChat','fbEnsureNotifThread','fbGetContracts','fbGetDMCQuoteProject',
  'fbGetItinerary','fbGetMenu','fbGetQuoteProject','fbGetTourPayments','fbGetVisaProc','fbLogAudit',
  'fbMarkChatRead','fbPullMasterRC','fbPushContracts','fbPushCustomers','fbPushFxRates','fbPushMasterRC',
  'fbPushNcc','fbPushNccProducts','fbPushNotifications','fbPushPois','fbPushVisaProjects','fbSaveDMCQuote',
  'fbSaveDMCQuoteState','fbSaveItinerary','fbSaveMenu','fbSaveQuote','fbSaveQuoteState','fbSaveRestaurants',
  'fbSaveTourPayments','fbSaveVisaProc','fbSaveVisaProducts','fbSendChatMessage','fbSendNotification',
  'fbSendNotificationMany','fbSetApprovalStage','fbSetDMCEntryLink','fbSetDMCQuoteStatus',
  'fbSetQuotePaymentSummary','fbSetQuoteStatus','fbSetRegularEntryLink','fbSetThreadStatus',
  'fbSubscribeAuditLog','fbSubscribeChats','fbSubscribeContracts','fbSubscribeCustomers',
  'fbSubscribeDMCQuoteHistory','fbSubscribeFxRates','fbSubscribeItineraries','fbSubscribeMasterRC',
  'fbSubscribeMenus','fbSubscribeNcc','fbSubscribeNccProducts','fbSubscribeNotifThread',
  'fbSubscribeNotifications','fbSubscribePaymentApprovals','fbSubscribePois','fbSubscribeQuoteHistory',
  'fbSubscribeRestaurants','fbSubscribeTourPayments','fbSubscribeVisaProcs','fbSubscribeVisaProducts',
  'fbSubscribeVisaProjects','fbToggleChatReaction','fbUpdateCollaborators','fbUpdateDMCCollaborators',
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('dataBackend selector', () => {
  it('exports every data-gateway function (75)', async () => {
    const dg = await import('@/lib/dataBackend');
    for (const n of NAMES) {
      expect(typeof (dg as Record<string, unknown>)[n], `${n} should be a function`).toBe('function');
    }
    expect(NAMES.length).toBe(75);
  });

  it('defaults to the Firebase gateway when the flag is unset', async () => {
    vi.resetModules();
    const fb = await import('@/lib/firebase');
    const dg = await import('@/lib/dataBackend');
    expect(dg.fbSubscribeNcc).toBe(fb.fbSubscribeNcc);
    expect(dg.fbSaveQuoteState).toBe(fb.fbSaveQuoteState);
  });

  it('selects the Supabase gateway when VITE_AUTH_BACKEND=supabase', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_AUTH_BACKEND', 'supabase');
    const sb = await import('@/lib/supabase');
    const dg = await import('@/lib/dataBackend');
    expect(dg.fbSubscribeNcc).toBe(sb.sbSubscribeNcc);
    expect(dg.fbSaveQuoteState).toBe(sb.sbSaveQuoteState);
  });
});
