import { initializeApp } from 'firebase/app';
import {
  deleteDoc, doc, getDoc, getFirestore, onSnapshot, setDoc, type DocumentReference,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  CloudQuoteEntry, CloudQuoteProject, Collaborator, Contract, Customer, CustomCostItem,
  Itinerary, ItineraryIndexEntry, Menu, MenuIndexEntry, Ncc,
  Notification, PaymentApprovalDoc, PaymentApprovalEntry, PaymentApprovalStage, PaymentRecord,
  QuoteDraft, RateCard, RateCardDoc, Restaurant, Template, TourPayments, User,
} from '@/types';

const firebaseConfig = {
  apiKey: 'AIzaSyAL-pifSBDDrbek3s2uwkeIYw5Y1GZO9Iw',
  authDomain: 'viettours-cost-calculator.firebaseapp.com',
  projectId: 'viettours-cost-calculator',
  storageBucket: 'viettours-cost-calculator.firebasestorage.app',
  messagingSenderId: '304145851784',
  appId: '1:304145851784:web:e4977ff4e343ab74e4c63d',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, 'viettours');

const USERS_DOC = doc(db, 'viettours', 'user_accounts');
const RC_DOC = doc(db, 'viettours', 'master_rate_card');
const QUOTE_HISTORY_DOC = doc(db, 'viettours', 'quote_history');
const CUSTOMER_DOC = doc(db, 'viettours', 'customer_list');
const NCC_DOC = doc(db, 'viettours', 'ncc_master');
const CONTRACTS_DOC = doc(db, 'viettours', 'contracts_master');
const notifDoc = (username: string) => doc(db, 'user_notifications', username);
const quoteProjectDoc = (cloudId: string) => doc(db, 'quote_projects', cloudId);

// Source: public/legacy.html:196-197
const DMC_QUOTE_HISTORY_DOC = doc(db, 'viettours', 'dmc_quote_history');
const dmcQuoteProjectDoc = (cloudId: string) => doc(db, 'dmc_quote_projects', cloudId);

// ── Users ──
export async function fbPullUsers(): Promise<User[]> {
  const snap = await getDoc(USERS_DOC);
  const data = snap.data();
  if (!data || !Array.isArray((data as { users?: User[] }).users)) return [];
  return (data as { users: User[] }).users;
}

export async function fbPushUsers(users: User[]): Promise<void> {
  await setDoc(USERS_DOC, { users, updatedAt: new Date().toISOString() });
}

// ── Rate Card ──
// Strip the vte_visa_rates mirror that legacy `_collectRC` and our
// fbPushMasterRC write into otherRates. The canonical source for visa rates
// is the top-level `visaRates` field; the mirror is for legacy `_applyRC`
// compatibility only and must not leak into the in-memory store.
function stripVisaMirror(doc: RateCardDoc): RateCardDoc {
  if (!doc.otherRates || !('vte_visa_rates' in doc.otherRates)) return doc;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.otherRates)) {
    if (k !== 'vte_visa_rates') cleaned[k] = v;
  }
  return { ...doc, otherRates: cleaned as RateCardDoc['otherRates'] };
}

export async function fbPullMasterRC(): Promise<RateCardDoc | null> {
  const snap = await getDoc(RC_DOC);
  if (!snap.exists()) return null;
  return stripVisaMirror(snap.data() as RateCardDoc);
}

export async function fbPushMasterRC(rc: RateCard, pushedBy: string): Promise<void> {
  // Legacy `_collectRC()` (index.html:41-50) mirrors `vte_visa_rates` into BOTH
  // top-level `visaRates` AND `otherRates['vte_visa_rates']`. Legacy `_applyRC()`
  // tolerates either shape (step 2 reads visaRates first, step 3 may overwrite
  // from otherRates), but mirroring keeps the cloud doc byte-equivalent to what
  // legacy would have written. Removes any ambiguity for the legacy app during
  // the cutover window (Phase 2 → 3).
  const otherRatesWithVisaMirror = {
    ...rc.otherRates,
    vte_visa_rates: rc.visaRates,
  };
  await setDoc(RC_DOC, {
    _meta: {
      version: '2.0',
      type: 'viettours_ratecard_master',
      pushedAt: new Date().toISOString(),
      pushedBy,
      app: 'Viettours Tour Cost Calculator',
      autoSync: true,
    },
    hotels: rc.hotels,
    visaRates: rc.visaRates,
    otherRates: otherRatesWithVisaMirror,
  });
}

export function fbSubscribeMasterRC(cb: (rc: RateCardDoc) => void): Unsubscribe {
  return onSnapshot(RC_DOC, (snap) => {
    if (snap.exists()) cb(stripVisaMirror(snap.data() as RateCardDoc));
  });
}

// ── Cloud Quote History ──

/**
 * Generate a quote code like "NĐ.01.31.05.26" / "NN.01.31.05.26" / "DMC.01.31.05.26".
 * Seq is per-day-per-prefix count from `existing`.
 * Source: public/legacy.html:235-248.
 */
export function generateQuoteCode(template: Template, existing: CloudQuoteEntry[]): string {
  const prefix = template === 'intl' ? 'NN' : template === 'dmc' ? 'DMC' : 'NĐ';
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const dateStr = `${dd}.${mm}.${yy}`;
  const todaySameType = existing.filter(
    (q) => q.quoteCode?.startsWith(prefix + '.') && q.quoteCode.endsWith('.' + dateStr),
  ).length;
  const seq = String(todaySameType + 1).padStart(2, '0');
  return `${prefix}.${seq}.${dateStr}`;
}

// ── Cloud Quote History (factory: regular + DMC share identical logic) ──

type SaveEntry = {
  id: number;
  cloudId: string;
  quoteCode?: string;
  name: string;
  template: Template;
  pax: number;
  totalCost: number;
  customerId?: string;
  customerName?: string;
  collaborators?: Collaborator[];
};

type SavedBy = { u: string; name: string; role: string };

function makeQuoteHistoryApi(
  historyDoc: DocumentReference,
  projectDoc: (cloudId: string) => DocumentReference,
) {
  return {
    /** Source: public/legacy.html:233. */
    fbSubscribeQuoteHistory(cb: (quotes: CloudQuoteEntry[]) => void): Unsubscribe {
      return onSnapshot(historyDoc, (snap) => {
        cb(snap.exists() ? ((snap.data().quotes as CloudQuoteEntry[]) ?? []) : []);
      });
    },

    /** Source: public/legacy.html:307-335. */
    async fbSaveQuote(entry: SaveEntry, savedBy: SavedBy): Promise<CloudQuoteEntry> {
      const nowIso = new Date().toISOString();
      const savedByLabel = `${savedBy.name} (${savedBy.role})`;
      const snap = await getDoc(historyDoc);
      const quotes = snap.exists() ? ((snap.data().quotes as CloudQuoteEntry[]) ?? []) : [];
      const idx = quotes.findIndex((q) => q.id === entry.id);

      const optionalFields: Partial<CloudQuoteEntry> = {};
      if (entry.customerId !== undefined) optionalFields.customerId = entry.customerId;
      if (entry.customerName !== undefined) optionalFields.customerName = entry.customerName;

      let saved: CloudQuoteEntry;
      if (idx >= 0) {
        const existing = quotes[idx];
        const entryDefined = Object.fromEntries(
          Object.entries(entry).filter(([, v]) => v !== undefined),
        ) as Partial<CloudQuoteEntry>;
        saved = {
          ...existing,
          ...entryDefined,
          quoteCode: existing.quoteCode,
          createdByUsername: existing.createdByUsername || savedBy.u,
          createdByName: existing.createdByName || savedBy.name,
          createdAt: existing.createdAt || nowIso,
          collaborators: entry.collaborators ?? existing.collaborators ?? [],
          updatedAt: nowIso,
          updatedBy: savedByLabel,
        };
        quotes[idx] = saved;
      } else {
        const quoteCode = entry.quoteCode ?? generateQuoteCode(entry.template, quotes);
        saved = {
          id: entry.id,
          cloudId: entry.cloudId,
          quoteCode,
          name: entry.name,
          template: entry.template,
          pax: entry.pax,
          totalCost: entry.totalCost,
          ...optionalFields,
          createdByUsername: savedBy.u,
          createdByName: savedBy.name,
          collaborators: entry.collaborators ?? [],
          createdAt: nowIso,
          updatedAt: nowIso,
          updatedBy: savedByLabel,
        };
        quotes.unshift(saved);
      }
      await setDoc(historyDoc, { quotes: quotes.slice(0, 500) });
      return saved;
    },

    /** Source: public/legacy.html:164-176. */
    async fbSaveQuoteState(
      cloudId: string,
      state: QuoteDraft,
      note: string | undefined,
      savedBy: { name: string; role: string },
    ): Promise<void> {
      const snap = await getDoc(projectDoc(cloudId));
      const existing = snap.exists()
        ? (snap.data() as CloudQuoteProject)
        : ({ versions: [], collaborators: [] } as Partial<CloudQuoteProject>);
      const versionNo = (existing.versions?.length ?? 0) + 1;
      const nowIso = new Date().toISOString();
      const savedByLabel = `${savedBy.name} (${savedBy.role})`;
      const newVersion = {
        versionNo,
        savedAt: nowIso,
        savedBy: savedByLabel,
        note: note?.trim() || `Phiên bản ${versionNo}`,
        state,
      };
      const versions = [...(existing.versions ?? []), newVersion].slice(-20);
      await setDoc(projectDoc(cloudId), {
        ...existing,
        versions,
        currentState: state,
        updatedAt: nowIso,
        updatedBy: savedBy.name,
      });
    },

    async fbDeleteQuote(id: number, cloudId: string): Promise<void> {
      const snap = await getDoc(historyDoc);
      if (snap.exists()) {
        const quotes = ((snap.data().quotes as CloudQuoteEntry[]) ?? []).filter(
          (q) => q.id !== id,
        );
        await setDoc(historyDoc, { quotes });
      }
      try {
        await deleteDoc(projectDoc(cloudId));
      } catch (e) {
        console.warn('fbDeleteQuote: project doc delete failed:', (e as Error).message);
      }
    },

    async fbUpdateCollaborators(
      id: number,
      cloudId: string,
      collaborators: Collaborator[],
    ): Promise<void> {
      // Write to project doc.
      const projSnap = await getDoc(projectDoc(cloudId));
      const existingProj = projSnap.exists() ? projSnap.data() : {};
      await setDoc(projectDoc(cloudId), { ...existingProj, collaborators });
      // Mirror onto the history entry so list filters see it.
      const histSnap = await getDoc(historyDoc);
      if (histSnap.exists()) {
        const quotes = ((histSnap.data().quotes as CloudQuoteEntry[]) ?? []).slice();
        const i = quotes.findIndex((q) => q.id === id);
        if (i >= 0) {
          quotes[i] = { ...quotes[i], collaborators };
          await setDoc(historyDoc, { quotes });
        }
      }
    },

    async fbGetQuoteProject(cloudId: string): Promise<CloudQuoteProject | null> {
      const snap = await getDoc(projectDoc(cloudId));
      return snap.exists() ? (snap.data() as CloudQuoteProject) : null;
    },
  };
}

const _regular = makeQuoteHistoryApi(QUOTE_HISTORY_DOC, quoteProjectDoc);
export const fbSubscribeQuoteHistory = _regular.fbSubscribeQuoteHistory;
export const fbSaveQuote             = _regular.fbSaveQuote;
export const fbSaveQuoteState        = _regular.fbSaveQuoteState;
export const fbDeleteQuote           = _regular.fbDeleteQuote;
export const fbUpdateCollaborators   = _regular.fbUpdateCollaborators;
export const fbGetQuoteProject       = _regular.fbGetQuoteProject;

const _dmc = makeQuoteHistoryApi(DMC_QUOTE_HISTORY_DOC, dmcQuoteProjectDoc);
export const fbSubscribeDMCQuoteHistory = _dmc.fbSubscribeQuoteHistory;
export const fbSaveDMCQuote              = _dmc.fbSaveQuote;
export const fbSaveDMCQuoteState         = _dmc.fbSaveQuoteState;
export const fbDeleteDMCQuote            = _dmc.fbDeleteQuote;
export const fbUpdateDMCCollaborators    = _dmc.fbUpdateCollaborators;
export const fbGetDMCQuoteProject        = _dmc.fbGetQuoteProject;

// ── Customers ──

/**
 * Subscribe to the customer list in real-time.
 * Source: public/legacy.html customer_list pattern (fbOnCustomers).
 */
export function fbSubscribeCustomers(
  cb: (list: Customer[]) => void,
): Unsubscribe {
  return onSnapshot(CUSTOMER_DOC, (snap) => {
    cb(snap.exists() ? ((snap.data().customers as Customer[]) ?? []) : []);
  });
}

/**
 * Full-overwrite push of the customer list.
 * Source: public/legacy.html (fbPushCustomers).
 */
export async function fbPushCustomers(
  list: Customer[],
  pushedBy: { name: string; role: string },
): Promise<void> {
  await setDoc(CUSTOMER_DOC, {
    customers: list,
    updatedAt: new Date().toISOString(),
    updatedBy: `${pushedBy.name} (${pushedBy.role})`,
  });
}

// ── NCC (Suppliers) ──

/**
 * Subscribe to the NCC (suppliers) list.
 * Legacy window.fbOnNCC reads data.suppliers.
 */
export function fbSubscribeNcc(cb: (list: Ncc[]) => void): Unsubscribe {
  return onSnapshot(NCC_DOC, (snap) => {
    cb(snap.exists() ? ((snap.data().suppliers as Ncc[]) ?? []) : []);
  });
}

/**
 * Full-overwrite push of the NCC list.
 * Legacy window.fbPushNCC writes { suppliers, updatedAt, updatedBy }.
 */
export async function fbPushNcc(
  list: Ncc[],
  pushedBy: { name: string; role: string },
): Promise<void> {
  await setDoc(NCC_DOC, {
    suppliers: list,
    updatedAt: new Date().toISOString(),
    updatedBy: `${pushedBy.name} (${pushedBy.role})`,
  });
}

// ── Contracts ──

/**
 * Subscribe to the contract list.
 * Source: legacy window.fbOnContracts (legacy.html:353).
 */
export function fbSubscribeContracts(cb: (list: Contract[]) => void): Unsubscribe {
  return onSnapshot(CONTRACTS_DOC, (snap) => {
    cb(snap.exists() ? ((snap.data().contracts as Contract[]) ?? []) : []);
  });
}

/**
 * One-time pull of the contract list (used for checking on init).
 * Source: legacy window.fbGetContracts (legacy.html:354).
 */
export async function fbGetContracts(): Promise<Contract[]> {
  const snap = await getDoc(CONTRACTS_DOC);
  return snap.exists() ? ((snap.data().contracts as Contract[]) ?? []) : [];
}

/**
 * Full-overwrite push of the contract list.
 * Source: legacy window.fbPushContracts (legacy.html:355-358).
 */
export async function fbPushContracts(
  list: Contract[],
  pushedBy: { name: string; role: string },
): Promise<void> {
  await setDoc(CONTRACTS_DOC, {
    contracts: list,
    updatedAt: new Date().toISOString(),
    updatedBy: `${pushedBy.name} (${pushedBy.role})`,
  });
}

// ── Notifications ──

/**
 * Send a notification to a target user. Prepends to their list; caps at 100.
 * Source: legacy window.fbSendNotification (legacy.html:417).
 */
export async function fbSendNotification(
  targetUsername: string,
  notif: Omit<Notification, 'id' | 'read' | 'createdAt'>,
): Promise<void> {
  const snap = await getDoc(notifDoc(targetUsername));
  const existing: Notification[] = snap.exists()
    ? ((snap.data().notifications as Notification[]) ?? [])
    : [];
  const newNotif: Notification = {
    ...notif,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    read: false,
    createdAt: new Date().toISOString(),
  };
  await setDoc(notifDoc(targetUsername), {
    notifications: [newNotif, ...existing].slice(0, 100),
  });
}

/**
 * Subscribe to the current user's notifications.
 * Source: legacy window.fbOnNotifications (legacy.html:427).
 */
export function fbSubscribeNotifications(
  username: string,
  cb: (list: Notification[]) => void,
): Unsubscribe {
  return onSnapshot(notifDoc(username), (snap) => {
    cb(snap.exists() ? ((snap.data().notifications as Notification[]) ?? []) : []);
  });
}

/**
 * Write the full notification list back (used for mark-read).
 */
export async function fbPushNotifications(
  username: string,
  notifications: Notification[],
): Promise<void> {
  await setDoc(notifDoc(username), { notifications });
}

// ── Tour Payments ──

const tourPaymentsDoc = (tourKey: string) => doc(db, 'tour_payments', tourKey);

/**
 * Full-overwrite push of payments + customItems for a tour.
 * Source: legacy window.fbSaveTourPayments (legacy.html:384).
 */
export async function fbSaveTourPayments(
  tourKey: string,
  payments: Record<string, PaymentRecord>,
  customItems: CustomCostItem[],
  savedBy: string,
): Promise<void> {
  await setDoc(tourPaymentsDoc(tourKey), {
    payments,
    customItems: customItems ?? [],
    updatedAt: new Date().toISOString(),
    updatedBy: savedBy || 'unknown',
  });
}

/**
 * Subscribe to a tour's payment doc.
 * Source: legacy window.fbOnTourPayments (legacy.html:387).
 */
export function fbSubscribeTourPayments(
  tourKey: string,
  cb: (data: TourPayments | null) => void,
): Unsubscribe {
  return onSnapshot(tourPaymentsDoc(tourKey), (snap) => {
    if (!snap.exists()) return cb(null);
    const data = snap.data();
    cb({
      payments: (data.payments ?? {}) as Record<string, PaymentRecord>,
      customItems: (data.customItems ?? []) as CustomCostItem[],
    });
  });
}

// ── Payment Approvals (2-stage flow) ──

const PA_DOC = doc(db, 'viettours', 'payment_approvals');

/**
 * Write a single stage of an approval (1 or 2). Final status follows legacy rules:
 *   - rejected at any stage  → finalStatus = 'rejected'
 *   - approved at stage 1    → finalStatus = 'pending_stage2'
 *   - approved at stage 2    → finalStatus = 'approved'
 * Intended approver names are preserved across stages so the PDF/badges can still
 * render the originally-designated names even after a delegate clicks.
 * Source: legacy window.fbSetApprovalStage (legacy.html:398).
 */
export async function fbSetApprovalStage(
  key: string,
  stage: 1 | 2,
  status: 'approved' | 'rejected',
  approverUsername: string,
  approverName: string,
  note: string,
  intended: { intendedApprover1Name?: string; intendedApprover2Name?: string } = {},
): Promise<void> {
  const snap = await getDoc(PA_DOC);
  const ex: PaymentApprovalDoc = snap.exists() ? (snap.data() as PaymentApprovalDoc) : {};
  const existing: PaymentApprovalEntry = ex[key] ?? {};
  const stageData: PaymentApprovalStage = {
    status,
    approverUsername: approverUsername || '',
    approverName: approverName || '',
    note: note || '',
    updatedAt: new Date().toISOString(),
  };
  const finalStatus: PaymentApprovalEntry['finalStatus'] =
    status === 'rejected' ? 'rejected' : stage === 2 ? 'approved' : 'pending_stage2';
  const updated: PaymentApprovalEntry = {
    ...existing,
    [`stage${stage}`]: stageData,
    currentStage: stage,
    finalStatus,
    ...(intended.intendedApprover1Name
      ? { intendedApprover1Name: intended.intendedApprover1Name } : {}),
    ...(intended.intendedApprover2Name
      ? { intendedApprover2Name: intended.intendedApprover2Name } : {}),
  };
  await setDoc(PA_DOC, { ...ex, [key]: updated });
}

/**
 * Subscribe to the full payment-approvals document (one doc, key → entry map).
 * Source: legacy window.fbOnPaymentApprovals (legacy.html:412).
 */
export function fbSubscribePaymentApprovals(
  cb: (data: PaymentApprovalDoc) => void,
): Unsubscribe {
  return onSnapshot(PA_DOC, (snap) => {
    cb(snap.exists() ? (snap.data() as PaymentApprovalDoc) : {});
  });
}

// ── Itineraries ──

const ITIN_INDEX_DOC = doc(db, 'viettours', 'itinerary_index');
const itinDoc = (id: string) => doc(db, 'tour_itineraries', id);

/**
 * Save the full itinerary doc, then upsert its metadata entry in the index.
 * Source: legacy window.fbSaveItinerary (legacy.html:453-461).
 */
export async function fbSaveItinerary(itin: Itinerary, savedBy: string): Promise<void> {
  const now = new Date().toISOString();
  await setDoc(itinDoc(itin.id), { ...itin, updatedAt: now, updatedBy: savedBy });

  const snap = await getDoc(ITIN_INDEX_DOC);
  const list = snap.exists() ? ((snap.data().items as ItineraryIndexEntry[]) ?? []) : [];
  const meta: ItineraryIndexEntry = {
    id: itin.id,
    code: itin.code ?? '',
    title: itin.title ?? '',
    destination: itin.destination ?? '',
    days: itin.days ?? 0,
    nights: itin.nights ?? 0,
    linkedQuoteName: itin.linkedQuoteName ?? '',
    updatedAt: now,
    updatedBy: savedBy,
  };
  const idx = list.findIndex((x) => x.id === itin.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...meta };
  else list.unshift({ ...meta, createdAt: now, createdBy: savedBy });
  await setDoc(ITIN_INDEX_DOC, { items: list.slice(0, 500) });
}

/**
 * One-time fetch of a full itinerary.
 * Source: legacy window.fbGetItinerary (legacy.html:463).
 */
export async function fbGetItinerary(id: string): Promise<Itinerary | null> {
  const snap = await getDoc(itinDoc(id));
  return snap.exists() ? (snap.data() as Itinerary) : null;
}

/**
 * Delete itinerary + remove its index entry. Best-effort: the index update runs
 * first so the row disappears even if the per-itinerary doc delete fails.
 * Source: legacy window.fbDeleteItinerary (legacy.html:464-467).
 */
export async function fbDeleteItinerary(id: string): Promise<void> {
  const snap = await getDoc(ITIN_INDEX_DOC);
  if (snap.exists()) {
    const items = ((snap.data().items as ItineraryIndexEntry[]) ?? []).filter((x) => x.id !== id);
    await setDoc(ITIN_INDEX_DOC, { items });
  }
  try {
    await deleteDoc(itinDoc(id));
  } catch {
    /* doc may not exist; index already cleaned */
  }
}

/**
 * Subscribe to the itinerary index (lightweight metadata list).
 * Source: legacy window.fbOnItineraries (legacy.html:462).
 */
export function fbSubscribeItineraries(
  cb: (list: ItineraryIndexEntry[]) => void,
): Unsubscribe {
  return onSnapshot(ITIN_INDEX_DOC, (s) => {
    cb(s.exists() ? ((s.data().items as ItineraryIndexEntry[]) ?? []) : []);
  });
}

// ── Restaurants ──

const REST_DOC = doc(db, 'viettours', 'restaurant_list');

/**
 * Subscribe to the shared restaurant library.
 * Source: legacy window.fbOnRestaurants (legacy.html:472).
 */
export function fbSubscribeRestaurants(cb: (list: Restaurant[]) => void): Unsubscribe {
  return onSnapshot(REST_DOC, (s) => {
    cb(s.exists() ? ((s.data().restaurants as Restaurant[]) ?? []) : []);
  });
}

/**
 * Full-overwrite push of the restaurant library.
 * Source: legacy window.fbSaveRestaurants (legacy.html:473).
 */
export async function fbSaveRestaurants(list: Restaurant[], savedBy: string): Promise<void> {
  await setDoc(REST_DOC, {
    restaurants: list,
    updatedAt: new Date().toISOString(),
    updatedBy: savedBy || '',
  });
}

// ── Menus ──

const MENU_INDEX_DOC = doc(db, 'viettours', 'menu_index');
const menuDoc = (id: string) => doc(db, 'tour_menus', id);

/**
 * Save the full menu doc, then upsert its metadata entry in the index.
 * Source: legacy window.fbSaveMenu (legacy.html:476-484).
 */
export async function fbSaveMenu(m: Menu, savedBy: string): Promise<void> {
  const now = new Date().toISOString();
  await setDoc(menuDoc(m.id), { ...m, updatedAt: now, updatedBy: savedBy });

  const snap = await getDoc(MENU_INDEX_DOC);
  const list = snap.exists() ? ((snap.data().items as MenuIndexEntry[]) ?? []) : [];
  const meta: MenuIndexEntry = {
    id: m.id,
    code: m.code ?? '',
    title: m.title ?? '',
    destination: m.destination ?? '',
    days: m.days ?? 0,
    linkedItineraryName: m.linkedItineraryName ?? '',
    linkedQuoteName: m.linkedQuoteName ?? '',
    updatedAt: now,
    updatedBy: savedBy,
  };
  const idx = list.findIndex((x) => x.id === m.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...meta };
  else list.unshift({ ...meta, createdAt: now, createdBy: savedBy });
  await setDoc(MENU_INDEX_DOC, { items: list.slice(0, 500) });
}

export async function fbGetMenu(id: string): Promise<Menu | null> {
  const snap = await getDoc(menuDoc(id));
  return snap.exists() ? (snap.data() as Menu) : null;
}

export async function fbDeleteMenu(id: string): Promise<void> {
  const snap = await getDoc(MENU_INDEX_DOC);
  if (snap.exists()) {
    const items = ((snap.data().items as MenuIndexEntry[]) ?? []).filter((x) => x.id !== id);
    await setDoc(MENU_INDEX_DOC, { items });
  }
  try {
    await deleteDoc(menuDoc(id));
  } catch {
    /* doc may not exist */
  }
}

export function fbSubscribeMenus(cb: (list: MenuIndexEntry[]) => void): Unsubscribe {
  return onSnapshot(MENU_INDEX_DOC, (s) => {
    cb(s.exists() ? ((s.data().items as MenuIndexEntry[]) ?? []) : []);
  });
}
