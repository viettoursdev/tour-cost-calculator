import { describe, it, expect } from 'vitest';
import * as gw from '../../src/lib/supabase';

const PHASE1 = [
  'sbPullUsers','sbPushUsers','sbPurgeLegacyPasswords',
  'sbSubscribeFxRates','sbPushFxRates','sbSubscribePois','sbPushPois','sbLogAudit','sbSubscribeAuditLog',
  'sbSubscribeCustomers','sbPushCustomers','sbSubscribeNcc','sbPushNcc','sbSubscribeNccProducts','sbPushNccProducts',
  'sbSubscribeContracts','sbGetContracts','sbPushContracts',
  'sbPullMasterRC','sbPushMasterRC','sbSubscribeMasterRC',
  'sbSubscribeVisaProducts','sbSaveVisaProducts','sbSubscribeVisaProcs','sbGetVisaProc','sbSaveVisaProc','sbDeleteVisaProc',
  'sbSubscribeVisaProjects','sbPushVisaProjects',
  'sbSubscribeItineraries','sbGetItinerary','sbSaveItinerary','sbDeleteItinerary',
  'sbSubscribeRestaurants','sbSaveRestaurants','sbSubscribeMenus','sbGetMenu','sbSaveMenu','sbDeleteMenu',
  'sbSendNotification','sbSubscribeNotifications','sbPushNotifications','sbSendNotificationMany',
  'sbEnsureNotifThread','sbSubscribeNotifThread','sbAddThreadComment','sbSetThreadStatus',
  'sbSetApprovalStage','sbSubscribePaymentApprovals','sbSaveTourPayments','sbGetTourPayments','sbSubscribeTourPayments',
];

describe('Phase-1 gateway surface', () => {
  it('exports every Phase-1 sb* function', () => {
    for (const name of PHASE1) expect(typeof (gw as Record<string, unknown>)[name], name).toBe('function');
  });
});
