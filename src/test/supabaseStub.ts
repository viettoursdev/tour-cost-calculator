import { vi } from 'vitest';

// Real `sb` is a SupabaseClient; unit tests never hit the network.
export const sb = {} as unknown;

// ── Auth ──
export const sbSendSignInLink = vi.fn(async (_email: string) => {});
export const sbIsSignInLink = vi.fn((_url: string) => false);
export const sbCompleteSignInLink = vi.fn(async (_url: string) => {});
export const sbSignInWithPassword = vi.fn(async (_email: string, _password: string) => {});
export const sbSignOut = vi.fn(async () => {});
export const sbOnAuthChange = vi.fn((_cb: (u: unknown) => void | Promise<void>) => () => {});
export const sbGetProfileById = vi.fn(async () => null);
export const sbGetAccessToken = vi.fn(async () => null);

// ── Users ──
export const sbPullUsers = vi.fn(async () => []);
export const sbPushUsers = vi.fn(async (): Promise<unknown[]> => []);
export const sbPurgeLegacyPasswords = vi.fn(async () => 0);

// ── Rate card ──
export const sbPullMasterRC = vi.fn(async () => null);
export const sbPushMasterRC = vi.fn(async () => 'stub-id');
export const sbSubscribeMasterRC = vi.fn(() => () => {});

// ── Quote codes ──
export const generateQuoteCode = vi.fn(() => 'TEST-QUOTE-CODE');

// ── Regular quote project ──
export const sbSubscribeQuoteHistory = vi.fn(() => () => {});
export const sbSaveQuote = vi.fn(async (entry: unknown) => entry);
export const sbSaveQuoteState = vi.fn(async () => {});
export const sbDeleteQuote = vi.fn(async () => {});
export const sbUpdateCollaborators = vi.fn(async () => {});
export const sbGetQuoteProject = vi.fn(async () => null);
export const sbSetQuotePaymentSummary = vi.fn(async () => {});
export const sbBackfillPaymentIndex = vi.fn(async () => 0);
export const sbBackfillWorkflowIndex = vi.fn(async () => 0);
export const sbGetTourPayments = vi.fn(async () => null);
export const sbLogAudit = vi.fn(async () => {});
export const sbSubscribeAuditLog = vi.fn(() => () => {});

// ── DMC quote project ──
export const sbSubscribeDMCQuoteHistory = vi.fn(() => () => {});
export const sbSaveDMCQuote = vi.fn(async (entry: unknown) => entry);
export const sbSaveDMCQuoteState = vi.fn(async () => {});
export const sbDeleteDMCQuote = vi.fn(async () => {});
export const sbUpdateDMCCollaborators = vi.fn(async () => {});
export const sbGetDMCQuoteProject = vi.fn(async () => null);

// ── Customers ──
export const sbSubscribeCustomers = vi.fn(() => () => {});
export const sbPushCustomers = vi.fn(async () => {});
export const sbDeleteCustomers = vi.fn(async () => {});

// ── NCC ──
export const sbSubscribeNcc = vi.fn(() => () => {});
export const sbPushNcc = vi.fn(async () => {});
export const sbUpsertNcc = vi.fn(async () => {});
export const sbDeleteNcc = vi.fn(async () => {});

// ── Contracts ──
export const sbSubscribeContracts = vi.fn(() => () => {});
export const sbGetContracts = vi.fn(async () => []);
export const sbPushContracts = vi.fn(async () => {});
export const sbDeleteContract = vi.fn(async () => {});

// ── Notifications ──
export const sbSendNotification = vi.fn(async () => {});
export const sbSubscribeNotifications = vi.fn(() => () => {});
export const sbPushNotifications = vi.fn(async () => {});

// ── Payments ──
export const sbSaveTourPayments = vi.fn(async () => {});
export const sbSubscribeTourPayments = vi.fn(() => () => {});
export const sbSetApprovalStage = vi.fn(async () => {});
export const sbSubscribePaymentApprovals = vi.fn(() => () => {});

// ── Itinerary / Restaurant / Menu / Visa ──
export const sbSaveItinerary = vi.fn(async () => {});
export const sbGetItinerary = vi.fn(async () => null);
export const sbDeleteItinerary = vi.fn(async () => {});
export const sbSubscribeItineraries = vi.fn(() => () => {});

export const sbSubscribeRestaurants = vi.fn(() => () => {});
export const sbSaveRestaurants = vi.fn(async () => {});

export const sbSaveMenu = vi.fn(async () => {});
export const sbGetMenu = vi.fn(async () => null);
export const sbDeleteMenu = vi.fn(async () => {});
export const sbSubscribeMenus = vi.fn(() => () => {});

export const sbSubscribeVisaProducts = vi.fn(() => () => {});
export const sbSaveVisaProducts = vi.fn(async () => {});

export const sbSaveVisaProc = vi.fn(async () => {});
export const sbGetVisaProc = vi.fn(async () => null);
export const sbDeleteVisaProc = vi.fn(async () => {});
export const sbSubscribeVisaProcs = vi.fn(() => () => {});

export const sbSubscribeVisaProjects = vi.fn(() => () => {});
export const sbPushVisaProjects = vi.fn(async () => {});
export const sbDeleteVisaProject = vi.fn(async () => {});

export const sbSubscribePois = vi.fn(() => () => {});
export const sbPushPois = vi.fn(async () => {});
export const sbDeletePoi = vi.fn(async () => {});
export const sbSubscribeGuideSchedule = vi.fn(() => () => {});
export const sbPushGuideSchedule = vi.fn(async () => {});
export const sbSubscribeEmailLinks = vi.fn(() => () => {});
export const sbPushEmailLinks = vi.fn(async () => {});
export const sbSubscribeTodos = vi.fn(() => () => {});
export const sbUpsertTodo = vi.fn(async () => {});
export const sbUpsertTodos = vi.fn(async () => {});
export const sbDeleteTodo = vi.fn(async () => {});

// ── Tra cứu chuyến bay ──
export const sbListFlightSearches = vi.fn(async (): Promise<unknown[]> => []);
export const sbUpsertFlightSearch = vi.fn(async () => {});
export const sbDeleteFlightSearch = vi.fn(async () => {});
export const sbPublishQuote = vi.fn(async () => {});
export const sbGetPublicQuote = vi.fn(async () => null);
export const sbAcceptPublicQuote = vi.fn(async () => {});
export const sbUnpublishQuote = vi.fn(async () => {});
export const sbSetQuoteShare = vi.fn(async () => {});
export const sbSubscribeNccProducts = vi.fn(() => () => {});
export const sbPushNccProducts = vi.fn(async () => {});
export const sbUpsertNccProduct = vi.fn(async () => {});
export const sbDeleteNccProduct = vi.fn(async () => {});

// ── FX rates ──
export const sbSubscribeFxRates = vi.fn(() => () => {});
export const sbPushFxRates = vi.fn(async () => 'stub-pushed-at');

// ── Quote status / entry links ──
export const sbSetQuoteStatus = vi.fn(async () => {});
export const sbSetDMCQuoteStatus = vi.fn(async () => {});
export const sbSetRegularEntryLink = vi.fn(async () => {});
export const sbSetDMCEntryLink = vi.fn(async () => {});

// ── Notification threads ──
export const sbEnsureNotifThread = vi.fn(async () => 'stub-thread-id');
export const sbSubscribeNotifThread = vi.fn(() => () => {});
export const sbAddThreadComment = vi.fn(async () => {});
export const sbSetThreadStatus = vi.fn(async () => {});
export const sbSendNotificationMany = vi.fn(async () => {});

// ── Tour profiles ──
export const sbSubscribeTourProfiles = vi.fn(() => () => {});
export const sbUpsertTourProfile = vi.fn(async () => {});
export const sbDeleteTourProfile = vi.fn(async () => {});
export const sbNextTourCode = vi.fn(async () => 'NĐ.01.01.25.01');
export const sbSetQuoteTourProfile = vi.fn(async () => {});

// ── Chat ──
export const dmChatId = vi.fn((a: string, b: string) => 'dm_' + [a, b].sort().join('__'));
export const sbSubscribeChats = vi.fn(() => () => {});
export const sbEnsureChat = vi.fn(async () => 'stub-chat-id');
export const sbSendChatMessage = vi.fn(async () => {});
export const sbMarkChatRead = vi.fn(async () => {});
export const sbEditChatMessage = vi.fn(async () => {});
export const sbDeleteChatMessage = vi.fn(async () => {});
export const sbToggleChatReaction = vi.fn(async () => {});
