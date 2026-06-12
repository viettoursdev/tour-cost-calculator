import { vi } from 'vitest';

// Real `db` is a Firestore instance; tests don't use it, so a placeholder is enough.
export const db = {};

// ── Users ──
export const fbPullUsers = vi.fn(async () => []);
export const fbPushUsers = vi.fn(async () => {});

// ── Rate card ──
export const fbPullMasterRC = vi.fn(async () => null);
export const fbPushMasterRC = vi.fn(async () => 'stub-id');
export const fbSubscribeMasterRC = vi.fn(() => () => {});

// ── Quote codes ──
export const generateQuoteCode = vi.fn(() => 'TEST-QUOTE-CODE');

// ── Regular quote project ──
export const fbSubscribeQuoteHistory = vi.fn(() => () => {});
export const fbSaveQuote = vi.fn(async (entry: unknown) => entry);
export const fbSaveQuoteState = vi.fn(async () => {});
export const fbDeleteQuote = vi.fn(async () => {});
export const fbUpdateCollaborators = vi.fn(async () => {});
export const fbGetQuoteProject = vi.fn(async () => null);

// ── DMC quote project ──
export const fbSubscribeDMCQuoteHistory = vi.fn(() => () => {});
export const fbSaveDMCQuote = vi.fn(async (entry: unknown) => entry);
export const fbSaveDMCQuoteState = vi.fn(async () => {});
export const fbDeleteDMCQuote = vi.fn(async () => {});
export const fbUpdateDMCCollaborators = vi.fn(async () => {});
export const fbGetDMCQuoteProject = vi.fn(async () => null);

// ── Customers ──
export const fbSubscribeCustomers = vi.fn(() => () => {});
export const fbPushCustomers = vi.fn(async () => {});

// ── NCC ──
export const fbSubscribeNcc = vi.fn(() => () => {});
export const fbPushNcc = vi.fn(async () => {});

// ── Contracts ──
export const fbSubscribeContracts = vi.fn(() => () => {});
export const fbGetContracts = vi.fn(async () => []);
export const fbPushContracts = vi.fn(async () => {});

// ── Notifications ──
export const fbSendNotification = vi.fn(async () => {});
export const fbSubscribeNotifications = vi.fn(() => () => {});
export const fbPushNotifications = vi.fn(async () => {});

// ── Payments ──
export const fbSaveTourPayments = vi.fn(async () => {});
export const fbSubscribeTourPayments = vi.fn(() => () => {});
export const fbSetApprovalStage = vi.fn(async () => {});
export const fbSubscribePaymentApprovals = vi.fn(() => () => {});

// ── Itinerary / Restaurant / Menu / Visa ──
export const fbSaveItinerary = vi.fn(async () => {});
export const fbGetItinerary = vi.fn(async () => null);
export const fbDeleteItinerary = vi.fn(async () => {});
export const fbSubscribeItineraries = vi.fn(() => () => {});

export const fbSubscribeRestaurants = vi.fn(() => () => {});
export const fbSaveRestaurants = vi.fn(async () => {});

export const fbSaveMenu = vi.fn(async () => {});
export const fbGetMenu = vi.fn(async () => null);
export const fbDeleteMenu = vi.fn(async () => {});
export const fbSubscribeMenus = vi.fn(() => () => {});

export const fbSubscribeVisaProducts = vi.fn(() => () => {});
export const fbSaveVisaProducts = vi.fn(async () => {});

export const fbSaveVisaProc = vi.fn(async () => {});
export const fbGetVisaProc = vi.fn(async () => null);
export const fbDeleteVisaProc = vi.fn(async () => {});
export const fbSubscribeVisaProcs = vi.fn(() => () => {});

export const fbSubscribeVisaProjects = vi.fn(() => () => {});
export const fbPushVisaProjects = vi.fn(async () => {});

// ── Auth ──
export const auth = {};
export const fbSendSignInLink = vi.fn(async (_email: string) => {});
export const fbIsSignInLink = vi.fn((_url: string) => false);
export const fbCompleteSignInLink = vi.fn(async (_email: string, _url: string) => ({
  uid: 'stub-uid',
  email: 'stub@viettours.com.vn',
  emailVerified: true,
} as unknown as import('firebase/auth').User));
export const fbSignInWithPassword = vi.fn(async (_email: string, _password: string) => ({
  uid: 'stub-uid',
  email: 'stub@viettours.com.vn',
  emailVerified: false,
} as unknown as import('firebase/auth').User));
export const fbSignOut = vi.fn(async () => {});
export const fbOnIdTokenChanged = vi.fn((_cb: (u: unknown) => void | Promise<void>) => () => {});
