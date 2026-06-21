import { initializeApp } from 'firebase/app';
import {
  getAuth, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  signInWithEmailAndPassword, signOut, onIdTokenChanged,
  type Auth, type User as FbUser, type Unsubscribe as AuthUnsubscribe,
} from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDoc, initializeFirestore, onSnapshot, query, setDoc, where,
  type DocumentReference, type DocumentSnapshot, type DocumentData, type Unsubscribe,
} from 'firebase/firestore';
import type {
  AuditEntry, Chat, ChatMessage,
  CloudQuoteEntry, CloudQuoteProject, Collaborator, Contract, Customer, CustomCostItem,
  EmailLink, FileAttachment, GuideScheduleDoc, Itinerary, ItineraryIndexEntry, Menu, MenuIndexEntry, Ncc, NccProduct, PoiEntry,
  ActivityStatus, Notification, NotifThread, NotifComment, PaymentApprovalDoc, PaymentApprovalEntry, PaymentApprovalStage, PaymentRecord,
  PublicQuoteDoc, QuoteDraft, QuoteRequestKind, QuoteStatus, RateCard, RateCardDoc, Restaurant, Template, TourPayments, User,
  Todo, VisaProcDoc, VisaProcIndexEntry, VisaProduct, VisaProductsDoc, VisaProjectDoc,
} from '@/types';

const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

for (const [k, v] of Object.entries(firebaseConfig)) {
  if (!v) throw new Error(`Missing Firebase env var for "${k}". Check your .env file (see .env.example).`);
}

const app = initializeApp(firebaseConfig);
// ignoreUndefinedProperties: Firestore rejects `undefined` field values in
// setDoc; strip them automatically so optional fields left undefined never
// crash a write (e.g. an entry missing currentStage/finalStatus).
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

// Firebase Auth — magic link (production) + Email+Password (DEV testing).
// Both methods set request.auth on Firestore rules; the rules also check the
// email matches @viettours.com.vn so anonymous and external-domain clients
// are denied. The next task (authStore rewrite) wires these wrappers in.
export const auth: Auth = getAuth(app);

/**
 * Subscribe to a Firestore document with a shared error handler. Firestore
 * fires `permission-denied` transiently while the auth token is torn down on
 * sign-out / token refresh — swallow that quietly instead of letting it surface
 * as an uncaught snapshot error; log everything else.
 */
function snapErr(e: Error): void {
  if ((e as { code?: string }).code === 'permission-denied') return;
  console.warn('Firestore snapshot error:', e.message);
}

function subDoc(
  ref: DocumentReference,
  onNext: (snap: DocumentSnapshot<DocumentData>) => void,
): Unsubscribe {
  return onSnapshot(ref, onNext, snapErr);
}

const ACTION_URL = `${window.location.origin}${import.meta.env.BASE_URL}?mode=auth`;

export async function fbSendSignInLink(email: string): Promise<void> {
  await sendSignInLinkToEmail(auth, email, { url: ACTION_URL, handleCodeInApp: true });
}

export function fbIsSignInLink(url: string): boolean {
  return isSignInWithEmailLink(auth, url);
}

export async function fbCompleteSignInLink(email: string, url: string): Promise<FbUser> {
  const cred = await signInWithEmailLink(auth, email, url);
  return cred.user;
}

export async function fbSignInWithPassword(email: string, password: string): Promise<FbUser> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function fbSignOut(): Promise<void> {
  await signOut(auth);
}

export function fbOnIdTokenChanged(
  cb: (user: FbUser | null) => void | Promise<void>,
): AuthUnsubscribe {
  return onIdTokenChanged(auth, cb);
}

const USERS_DOC = doc(db, 'viettours', 'user_accounts');
const RC_DOC = doc(db, 'viettours', 'master_rate_card');
const QUOTE_HISTORY_DOC = doc(db, 'viettours', 'quote_history');
const CUSTOMER_DOC = doc(db, 'viettours', 'customer_list');
const NCC_DOC = doc(db, 'viettours', 'ncc_master');
const CONTRACTS_DOC = doc(db, 'viettours', 'contracts_master');
const FX_RATES_DOC = doc(db, 'viettours', 'fx_rates');
const notifDoc = (username: string) => doc(db, 'user_notifications', username);
const quoteProjectDoc = (cloudId: string) => doc(db, 'quote_projects', cloudId);

// Source: public/legacy.html:196-197
const DMC_QUOTE_HISTORY_DOC = doc(db, 'viettours', 'dmc_quote_history');
const dmcQuoteProjectDoc = (cloudId: string) => doc(db, 'dmc_quote_projects', cloudId);

// ── Users ──
/** Bỏ trường mật khẩu plaintext di sản khỏi 1 user. */
const stripPwd = (u: User): User => {
  if (u.p === undefined) return u;
  const { p: _p, ...rest } = u;
  void _p;
  return rest;
};

export async function fbPullUsers(): Promise<User[]> {
  const snap = await getDoc(USERS_DOC);
  const data = snap.data();
  if (!data || !Array.isArray((data as { users?: User[] }).users)) return [];
  return (data as { users: User[] }).users.map(stripPwd);
}

export async function fbPushUsers(users: User[]): Promise<void> {
  await setDoc(USERS_DOC, { users: users.map(stripPwd), updatedAt: new Date().toISOString() });
}

/** Xoá mật khẩu plaintext di sản khỏi MỌI bản ghi user trong Firestore.
 *  Idempotent — chỉ ghi khi còn bản ghi chứa `p`. Trả về số bản ghi đã làm sạch. */
export async function fbPurgeLegacyPasswords(): Promise<number> {
  const snap = await getDoc(USERS_DOC);
  const data = snap.data() as { users?: User[] } | undefined;
  const users = data?.users;
  if (!Array.isArray(users)) return 0;
  const dirty = users.filter((u) => u.p !== undefined).length;
  if (!dirty) return 0;
  await setDoc(USERS_DOC, { users: users.map(stripPwd), updatedAt: new Date().toISOString() });
  return dirty;
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

export async function fbPushMasterRC(rc: RateCard, pushedBy: string): Promise<string> {
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
  const pushedAt = new Date().toISOString();
  await setDoc(RC_DOC, {
    _meta: {
      version: '2.0',
      type: 'viettours_ratecard_master',
      pushedAt,
      pushedBy,
      app: 'Viettours Tour Cost Calculator',
      autoSync: true,
    },
    hotels: rc.hotels,
    visaRates: rc.visaRates,
    otherRates: otherRatesWithVisaMirror,
  });
  // Caller records this so the self-echo from onSnapshot can be ignored
  // (otherwise our own round-tripped write clobbers in-progress local edits).
  return pushedAt;
}

export function fbSubscribeMasterRC(cb: (rc: RateCardDoc) => void): Unsubscribe {
  return subDoc(RC_DOC, (snap) => {
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
  dest?: string;
  status?: QuoteStatus;
  request?: QuoteRequestKind;
  deadline?: string;
  lossReason?: string;
  departDate?: string;
  days?: number;
  workflowDue?: { label: string; dueDate: string; assignee?: string }[];
  workflowSummary?: { current?: string; currentAssignee?: string; donePct: number; total: number; overdue: number };
  collaborators?: Collaborator[];
  attachment?: FileAttachment;
  attachments?: FileAttachment[];
  excelFile?: FileAttachment;
  excelFiles?: FileAttachment[];
  linkedQuoteId?: string;
  linkedQuoteName?: string;
  linkedQuoteTemplate?: Template;
};

type SavedBy = { u: string; name: string; role: string };

type EntryLink = { linkedQuoteId?: string; linkedQuoteName?: string; linkedQuoteTemplate?: Template };

function makeQuoteHistoryApi(
  historyDoc: DocumentReference,
  projectDoc: (cloudId: string) => DocumentReference,
) {
  return {
    /** Source: public/legacy.html:233. */
    fbSubscribeQuoteHistory(cb: (quotes: CloudQuoteEntry[]) => void): Unsubscribe {
      return subDoc(historyDoc, (snap) => {
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
      if (entry.status !== undefined) optionalFields.status = entry.status;
      if (entry.dest !== undefined) optionalFields.dest = entry.dest;
      if (entry.request !== undefined) optionalFields.request = entry.request;
      if (entry.deadline !== undefined) optionalFields.deadline = entry.deadline;
      if (entry.lossReason !== undefined) optionalFields.lossReason = entry.lossReason;
      if (entry.departDate !== undefined) optionalFields.departDate = entry.departDate;
      if (entry.days !== undefined) optionalFields.days = entry.days;
      if (entry.workflowDue !== undefined) optionalFields.workflowDue = entry.workflowDue;
      if (entry.workflowSummary !== undefined) optionalFields.workflowSummary = entry.workflowSummary;
      if (entry.customerId !== undefined) optionalFields.customerId = entry.customerId;
      if (entry.customerName !== undefined) optionalFields.customerName = entry.customerName;
      if (entry.attachment !== undefined) optionalFields.attachment = entry.attachment;
      if (entry.attachments !== undefined) optionalFields.attachments = entry.attachments;
      if (entry.excelFile !== undefined) optionalFields.excelFile = entry.excelFile;
      if (entry.excelFiles !== undefined) optionalFields.excelFiles = entry.excelFiles;
      if (entry.linkedQuoteId !== undefined) optionalFields.linkedQuoteId = entry.linkedQuoteId;
      if (entry.linkedQuoteName !== undefined) optionalFields.linkedQuoteName = entry.linkedQuoteName;
      if (entry.linkedQuoteTemplate !== undefined) optionalFields.linkedQuoteTemplate = entry.linkedQuoteTemplate;

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
      // Giữ doc index dưới giới hạn 1 MB: cắt bớt entry cũ nhất nếu quá lớn.
      let kept = quotes.slice(0, 500);
      while (kept.length > 1 && new TextEncoder().encode(JSON.stringify({ quotes: kept })).length > 1_000_000) {
        kept = kept.slice(0, -1);
      }
      await setDoc(historyDoc, { quotes: kept });
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
      // Firestore giới hạn 1 doc ≤ 1.048.576 byte. Doc này chứa tới 20 snapshot
      // draft → khi báo giá lớn dễ vượt → setDoc ném lỗi "không lưu được". Bỏ bớt
      // phiên bản CŨ NHẤT cho tới khi doc dưới ngưỡng an toàn (luôn giữ bản mới nhất).
      const SIZE_LIMIT = 1_000_000;
      const byteSize = (o: unknown) => new TextEncoder().encode(JSON.stringify(o)).length;
      let versions = [...(existing.versions ?? []), newVersion].slice(-20);
      const build = (vs: typeof versions) => ({ ...existing, versions: vs, currentState: state, updatedAt: nowIso, updatedBy: savedBy.name });
      let payload = build(versions);
      while (versions.length > 1 && byteSize(payload) > SIZE_LIMIT) {
        versions = versions.slice(1); // bỏ phiên bản cũ nhất
        payload = build(versions);
      }
      await setDoc(projectDoc(cloudId), payload);
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

    /** Ghi liên kết chéo lên bản ghi lịch sử (theo cloudId). Dùng để cập nhật
     *  bản ghi đối ứng khi "lưu cả hai" (DMC ↔ báo giá nước ngoài). */
    async fbSetEntryLink(cloudId: string, link: EntryLink): Promise<void> {
      const snap = await getDoc(historyDoc);
      if (!snap.exists()) return;
      const quotes = ((snap.data().quotes as CloudQuoteEntry[]) ?? []).slice();
      const i = quotes.findIndex((q) => q.cloudId === cloudId);
      if (i < 0) return;
      quotes[i] = { ...quotes[i], ...link };
      await setDoc(historyDoc, { quotes });
    },

    /** Backfill chỉ số quy trình (workflowDue/workflowSummary) cho nhiều báo giá
     *  trong index — đọc 1 lần, ghi 1 lần. Trả về số bản ghi được cập nhật. */
    async fbBackfillWorkflowIndex(
      updates: Record<string, Pick<CloudQuoteEntry, 'workflowDue' | 'workflowSummary' | 'departDate'>>,
    ): Promise<number> {
      const ids = Object.keys(updates);
      if (!ids.length) return 0;
      const snap = await getDoc(historyDoc);
      if (!snap.exists()) return 0;
      const quotes = ((snap.data().quotes as CloudQuoteEntry[]) ?? []).slice();
      let n = 0;
      for (let i = 0; i < quotes.length; i++) {
        const u = updates[quotes[i].cloudId];
        if (u) { quotes[i] = { ...quotes[i], ...u }; n++; }
      }
      if (n) await setDoc(historyDoc, { quotes });
      return n;
    },

    /** Cập nhật tóm tắt công nợ của 1 báo giá (theo cloudId). */
    async fbSetEntryPaymentSummary(cloudId: string, paymentSummary: CloudQuoteEntry['paymentSummary'], nccDue?: CloudQuoteEntry['nccDue']): Promise<void> {
      const snap = await getDoc(historyDoc);
      if (!snap.exists()) return;
      const quotes = ((snap.data().quotes as CloudQuoteEntry[]) ?? []).slice();
      const i = quotes.findIndex((q) => q.cloudId === cloudId);
      if (i < 0) return;
      quotes[i] = { ...quotes[i], paymentSummary, ...(nccDue !== undefined ? { nccDue } : {}) };
      await setDoc(historyDoc, { quotes });
    },

    /** Backfill tóm tắt công nợ cho nhiều báo giá — đọc 1 lần, ghi 1 lần. */
    async fbBackfillPaymentIndex(updates: Record<string, CloudQuoteEntry['paymentSummary']>): Promise<number> {
      const ids = Object.keys(updates);
      if (!ids.length) return 0;
      const snap = await getDoc(historyDoc);
      if (!snap.exists()) return 0;
      const quotes = ((snap.data().quotes as CloudQuoteEntry[]) ?? []).slice();
      let n = 0;
      for (let i = 0; i < quotes.length; i++) {
        if (updates[quotes[i].cloudId] !== undefined) { quotes[i] = { ...quotes[i], paymentSummary: updates[quotes[i].cloudId] }; n++; }
      }
      if (n) await setDoc(historyDoc, { quotes });
      return n;
    },

    /** Gắn/gỡ thông tin chia sẻ công khai (token) lên bản ghi index. */
    async fbSetEntryShare(cloudId: string, share: CloudQuoteEntry['share'] | null): Promise<void> {
      const snap = await getDoc(historyDoc);
      if (!snap.exists()) return;
      const quotes = ((snap.data().quotes as CloudQuoteEntry[]) ?? []).slice();
      const i = quotes.findIndex((q) => q.cloudId === cloudId);
      if (i < 0) return;
      if (share) quotes[i] = { ...quotes[i], share };
      else { const rest = { ...quotes[i] }; delete rest.share; quotes[i] = rest; }
      await setDoc(historyDoc, { quotes });
    },

    /** Cập nhật nhanh trạng thái (và lý do thua) báo giá lên lịch sử (theo cloudId). */
    async fbSetEntryStatus(cloudId: string, status: QuoteStatus, lossReason?: string): Promise<void> {
      const snap = await getDoc(historyDoc);
      if (!snap.exists()) return;
      const quotes = ((snap.data().quotes as CloudQuoteEntry[]) ?? []).slice();
      const i = quotes.findIndex((q) => q.cloudId === cloudId);
      if (i < 0) return;
      // Loại trạng thái thắng/đang chạy thì xoá lý do thua cũ.
      const isLoss = status === 'not_selected' || status === 'cancelled';
      quotes[i] = { ...quotes[i], status, lossReason: isLoss ? (lossReason ?? quotes[i].lossReason) : undefined };
      await setDoc(historyDoc, { quotes });
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
export const fbSetRegularEntryLink   = _regular.fbSetEntryLink;
export const fbSetQuoteStatus        = _regular.fbSetEntryStatus;
export const fbBackfillWorkflowIndex = _regular.fbBackfillWorkflowIndex;
export const fbSetQuotePaymentSummary = _regular.fbSetEntryPaymentSummary;
export const fbSetQuoteShare         = _regular.fbSetEntryShare;
export const fbBackfillPaymentIndex  = _regular.fbBackfillPaymentIndex;

const _dmc = makeQuoteHistoryApi(DMC_QUOTE_HISTORY_DOC, dmcQuoteProjectDoc);
export const fbSubscribeDMCQuoteHistory = _dmc.fbSubscribeQuoteHistory;
export const fbSaveDMCQuote              = _dmc.fbSaveQuote;
export const fbSaveDMCQuoteState         = _dmc.fbSaveQuoteState;
export const fbDeleteDMCQuote            = _dmc.fbDeleteQuote;
export const fbUpdateDMCCollaborators    = _dmc.fbUpdateCollaborators;
export const fbGetDMCQuoteProject        = _dmc.fbGetQuoteProject;
export const fbSetDMCEntryLink           = _dmc.fbSetEntryLink;
export const fbSetDMCQuoteStatus         = _dmc.fbSetEntryStatus;

// ── Customers ──

/**
 * Subscribe to the customer list in real-time.
 * Source: public/legacy.html customer_list pattern (fbOnCustomers).
 */
export function fbSubscribeCustomers(
  cb: (list: Customer[]) => void,
): Unsubscribe {
  return subDoc(CUSTOMER_DOC, (snap) => {
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
  return subDoc(NCC_DOC, (snap) => {
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
  return subDoc(CONTRACTS_DOC, (snap) => {
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
  return subDoc(notifDoc(username), (snap) => {
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

// ── Shared FX rates (synced across all accounts) ──

export type FxRatesDoc = {
  rates: Record<string, number>;
  _meta?: { pushedAt?: string; pushedBy?: string };
};

export function fbSubscribeFxRates(cb: (doc: FxRatesDoc) => void): Unsubscribe {
  return subDoc(FX_RATES_DOC, (snap) => {
    if (snap.exists()) cb(snap.data() as FxRatesDoc);
  });
}

export async function fbPushFxRates(rates: Record<string, number>, pushedBy: string): Promise<string> {
  const pushedAt = new Date().toISOString();
  await setDoc(FX_RATES_DOC, { rates, _meta: { pushedAt, pushedBy } });
  return pushedAt;
}

// ── Notification Center: shared comment threads + multi-send ──

// ── Chat nội bộ (1-1 & nhóm) ──
const CHAT_MSG_CAP = 500;
const chatDoc = (id: string) => doc(db, 'chats', id);
/** ID hội thoại 1-1 cố định theo cặp username (sắp xếp) để không tạo trùng. */
export const dmChatId = (a: string, b: string) => 'dm_' + [a, b].sort().join('__');

/** Theo dõi mọi cuộc trò chuyện user là thành viên (realtime). */
export function fbSubscribeChats(username: string, cb: (chats: Chat[]) => void): Unsubscribe {
  const qy = query(collection(db, 'chats'), where('members', 'array-contains', username));
  return onSnapshot(qy, (snap) => {
    const list = snap.docs.map((d) => d.data() as Chat)
      .sort((a, b) => (b.lastAt ?? b.createdAt).localeCompare(a.lastAt ?? a.createdAt));
    cb(list);
  }, (e) => console.warn('fbSubscribeChats:', e.message));
}

export function fbSubscribeChat(id: string, cb: (c: Chat | null) => void): Unsubscribe {
  return subDoc(chatDoc(id), (snap) => cb(snap.exists() ? (snap.data() as Chat) : null));
}

/** Tạo cuộc trò chuyện nếu chưa có (1-1 dedup theo dmChatId; nhóm tạo mới). */
export async function fbEnsureChat(chat: Chat): Promise<void> {
  const snap = await getDoc(chatDoc(chat.id));
  if (snap.exists()) {
    if (chat.isGroup) {
      const ex = snap.data() as Chat;
      const members = Array.from(new Set([...(ex.members ?? []), ...chat.members]));
      await setDoc(chatDoc(chat.id), { ...ex, members, title: chat.title || ex.title });
    }
    return;
  }
  await setDoc(chatDoc(chat.id), chat);
}

/** Gửi 1 tin nhắn (read-modify-write; giữ tối đa CHAT_MSG_CAP tin gần nhất). */
export async function fbSendChatMessage(id: string, msg: ChatMessage): Promise<void> {
  const snap = await getDoc(chatDoc(id));
  if (!snap.exists()) return;
  const c = snap.data() as Chat;
  const messages = [...(c.messages ?? []), msg].slice(-CHAT_MSG_CAP);
  await setDoc(chatDoc(id), {
    ...c, messages, lastAt: msg.at,
    lastText: msg.text || (msg.file ? `📎 ${msg.file.name}` : ''), lastByName: msg.byName,
    reads: { ...(c.reads ?? {}), [msg.by]: msg.at },
  });
}

const chatPreview = (m: ChatMessage): string =>
  m.deleted ? '🚫 Tin đã thu hồi' : m.text || (m.file ? `📎 ${m.file.name}` : '');

/** Sửa nội dung 1 tin (chỉ chủ tin). Cập nhật preview nếu là tin cuối. */
export async function fbEditChatMessage(id: string, msgId: string, text: string): Promise<void> {
  const snap = await getDoc(chatDoc(id));
  if (!snap.exists()) return;
  const c = snap.data() as Chat;
  const messages = (c.messages ?? []).map((m) => (m.id === msgId ? { ...m, text, editedAt: new Date().toISOString() } : m));
  const last = messages[messages.length - 1];
  await setDoc(chatDoc(id), { ...c, messages, ...(last?.id === msgId ? { lastText: chatPreview(last) } : {}) });
}

/** Thu hồi 1 tin: xoá nội dung/file, đánh dấu deleted (chỉ chủ tin). */
export async function fbDeleteChatMessage(id: string, msgId: string): Promise<void> {
  const snap = await getDoc(chatDoc(id));
  if (!snap.exists()) return;
  const c = snap.data() as Chat;
  const messages = (c.messages ?? []).map((m) => (m.id === msgId ? { id: m.id, by: m.by, byName: m.byName, at: m.at, deleted: true } : m));
  const last = messages[messages.length - 1];
  await setDoc(chatDoc(id), { ...c, messages, ...(last?.id === msgId ? { lastText: chatPreview(last) } : {}) });
}

/** Bật/tắt cảm xúc của user trên 1 tin. */
export async function fbToggleChatReaction(id: string, msgId: string, emoji: string, username: string): Promise<void> {
  const snap = await getDoc(chatDoc(id));
  if (!snap.exists()) return;
  const c = snap.data() as Chat;
  const messages = (c.messages ?? []).map((m) => {
    if (m.id !== msgId) return m;
    const reactions = { ...(m.reactions ?? {}) };
    const arr = reactions[emoji] ?? [];
    const next = arr.includes(username) ? arr.filter((u) => u !== username) : [...arr, username];
    if (next.length) reactions[emoji] = next; else delete reactions[emoji];
    return { ...m, reactions };
  });
  await setDoc(chatDoc(id), { ...c, messages });
}

/** Đánh dấu user đã đọc cuộc trò chuyện tới thời điểm hiện tại. */
export async function fbMarkChatRead(id: string, username: string): Promise<void> {
  const snap = await getDoc(chatDoc(id));
  if (!snap.exists()) return;
  const c = snap.data() as Chat;
  await setDoc(chatDoc(id), { ...c, reads: { ...(c.reads ?? {}), [username]: new Date().toISOString() } });
}

const notifThreadDoc = (id: string) => doc(db, 'notification_threads', id);

/** Create the thread if missing, else merge in any newly-added members/link. */
export async function fbEnsureNotifThread(thread: NotifThread): Promise<void> {
  const snap = await getDoc(notifThreadDoc(thread.id));
  if (snap.exists()) {
    const ex = snap.data() as NotifThread;
    const members = Array.from(new Set([...(ex.members ?? []), ...thread.members]));
    await setDoc(notifThreadDoc(thread.id), {
      ...ex, members, link: thread.link ?? ex.link ?? null, title: thread.title || ex.title,
    });
  } else {
    await setDoc(notifThreadDoc(thread.id), thread);
  }
}

export function fbSubscribeNotifThread(id: string, cb: (t: NotifThread | null) => void): Unsubscribe {
  return subDoc(notifThreadDoc(id), (snap) => cb(snap.exists() ? (snap.data() as NotifThread) : null));
}

/** Append a comment to a shared thread (read-modify-write). */
export async function fbAddThreadComment(id: string, comment: NotifComment): Promise<void> {
  const snap = await getDoc(notifThreadDoc(id));
  if (!snap.exists()) return;
  const t = snap.data() as NotifThread;
  await setDoc(notifThreadDoc(id), { ...t, comments: [...(t.comments ?? []), comment] });
}

/**
 * Update the live status of a shared activity thread (read-modify-write).
 * Both the requester and the approvers subscribe to the thread, so the new
 * status propagates to everyone in place.
 */
export async function fbSetThreadStatus(
  id: string,
  status: ActivityStatus,
  updatedByName: string,
): Promise<void> {
  const snap = await getDoc(notifThreadDoc(id));
  if (!snap.exists()) return;
  const t = snap.data() as NotifThread;
  await setDoc(notifThreadDoc(id), {
    ...t, status, updatedAt: new Date().toISOString(), updatedByName,
  });
}

/** Send the same notification to multiple recipients. */
export async function fbSendNotificationMany(
  targets: string[],
  notif: Omit<Notification, 'id' | 'read' | 'createdAt'>,
): Promise<void> {
  await Promise.all(Array.from(new Set(targets)).map((u) => fbSendNotification(u, notif)));
}

// ── Tour Payments ──

// ── Audit log (nhật ký hoạt động cấp hệ thống) ──
const AUDIT_DOC = doc(db, 'viettours', 'audit_log');
const AUDIT_CAP = 2000;

/** Ghi 1 dòng nhật ký (read-modify-write, giữ tối đa AUDIT_CAP dòng gần nhất). */
export async function fbLogAudit(entry: AuditEntry): Promise<void> {
  const snap = await getDoc(AUDIT_DOC);
  const entries = snap.exists() ? ((snap.data().entries as AuditEntry[]) ?? []) : [];
  const kept = [entry, ...entries].slice(0, AUDIT_CAP); // mới nhất ở đầu
  await setDoc(AUDIT_DOC, { entries: kept });
}

export function fbSubscribeAuditLog(cb: (entries: AuditEntry[]) => void): Unsubscribe {
  return subDoc(AUDIT_DOC, (snap) => cb(snap.exists() ? ((snap.data().entries as AuditEntry[]) ?? []) : []));
}

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

/** Đọc 1 lần payment doc của tour (cho backfill công nợ). */
export async function fbGetTourPayments(tourKey: string): Promise<TourPayments | null> {
  const snap = await getDoc(tourPaymentsDoc(tourKey));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    payments: (data.payments ?? {}) as Record<string, PaymentRecord>,
    customItems: (data.customItems ?? []) as CustomCostItem[],
  };
}

/**
 * Subscribe to a tour's payment doc.
 * Source: legacy window.fbOnTourPayments (legacy.html:387).
 */
export function fbSubscribeTourPayments(
  tourKey: string,
  cb: (data: TourPayments | null) => void,
): Unsubscribe {
  return subDoc(tourPaymentsDoc(tourKey), (snap) => {
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
  return subDoc(PA_DOC, (snap) => {
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
    ...(itin.customerName ? { customerName: itin.customerName } : {}),
    ...(itin.country ? { country: itin.country } : {}),
    linkedQuoteId: itin.linkedQuoteId ?? null,
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
  return subDoc(ITIN_INDEX_DOC, (s) => {
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
  return subDoc(REST_DOC, (s) => {
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
    linkedItineraryId: m.linkedItineraryId ?? null,
    linkedItineraryName: m.linkedItineraryName ?? '',
    linkedQuoteId: m.linkedQuoteId ?? null,
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
  return subDoc(MENU_INDEX_DOC, (s) => {
    cb(s.exists() ? ((s.data().items as MenuIndexEntry[]) ?? []) : []);
  });
}

// ── Visa products + FX rates ──

const VISA_PRODUCTS_DOC = doc(db, 'viettours', 'visa_products');

/**
 * Subscribe to the visa-product catalog (products + FX rates).
 * Source: legacy window.fbOnVisaProducts (legacy.html:491).
 */
export function fbSubscribeVisaProducts(
  cb: (data: VisaProductsDoc | null) => void,
): Unsubscribe {
  return subDoc(VISA_PRODUCTS_DOC, (s) => {
    cb(s.exists() ? (s.data() as VisaProductsDoc) : null);
  });
}

/**
 * Save the visa catalog (products + FX rates).
 * Source: legacy window.fbSaveVisaProducts (legacy.html:492).
 */
export async function fbSaveVisaProducts(
  data: { products: VisaProduct[]; rates: Record<string, number> },
  savedBy: string,
): Promise<void> {
  const now = new Date().toISOString();
  // Lưu phiên bản: đọc doc cũ, đẩy snapshot của lần lưu này lên đầu (cap 20).
  const prevSnap = await getDoc(VISA_PRODUCTS_DOC);
  const prev = prevSnap.exists() ? (prevSnap.data() as VisaProductsDoc) : null;
  const prevVersions = prev?.versions ?? [];
  const versionNo = (prevVersions[0]?.versionNo ?? 0) + 1;
  const versions = [
    { versionNo, savedAt: now, savedBy: savedBy || '', products: data.products },
    ...prevVersions,
  ].slice(0, 20);
  await setDoc(VISA_PRODUCTS_DOC, {
    products: data.products,
    rates: data.rates,
    updatedAt: now,
    updatedBy: savedBy || '',
    versions,
  });
}

// ── Visa procedure documents ──

const VISA_PROC_INDEX_DOC = doc(db, 'viettours', 'visa_proc_index');
const visaProcDoc = (id: string) => doc(db, 'visa_procedures', id);

/**
 * Save full visa-procedure doc, then upsert its metadata entry in the index.
 * Source: legacy window.fbSaveVisaProc (legacy.html:495-503).
 */
export async function fbSaveVisaProc(d: VisaProcDoc, savedBy: string): Promise<void> {
  const now = new Date().toISOString();
  await setDoc(visaProcDoc(d.id), { ...d, updatedAt: now, updatedBy: savedBy });

  const snap = await getDoc(VISA_PROC_INDEX_DOC);
  const list = snap.exists() ? ((snap.data().items as VisaProcIndexEntry[]) ?? []) : [];
  const meta: VisaProcIndexEntry = {
    id: d.id,
    code: d.code ?? '',
    title: d.title ?? '',
    country: d.country ?? '',
    visaType: d.visaType ?? '',
    isTemplate: d.isTemplate ?? false,
    linkedQuoteName: d.linkedQuoteName ?? '',
    collaborators: d.collaborators ?? [],
    createdByUsername: d.createdByUsername ?? '',
    createdByName: d.createdByName ?? '',
    updatedAt: now,
    updatedBy: savedBy,
  };
  const idx = list.findIndex((x) => x.id === d.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...meta };
  else list.unshift({ ...meta, createdAt: now });
  await setDoc(VISA_PROC_INDEX_DOC, { items: list.slice(0, 500) });
}

export async function fbGetVisaProc(id: string): Promise<VisaProcDoc | null> {
  const snap = await getDoc(visaProcDoc(id));
  return snap.exists() ? (snap.data() as VisaProcDoc) : null;
}

export async function fbDeleteVisaProc(id: string): Promise<void> {
  const snap = await getDoc(VISA_PROC_INDEX_DOC);
  if (snap.exists()) {
    const items = ((snap.data().items as VisaProcIndexEntry[]) ?? []).filter((x) => x.id !== id);
    await setDoc(VISA_PROC_INDEX_DOC, { items });
  }
  try {
    await deleteDoc(visaProcDoc(id));
  } catch {
    /* doc may not exist */
  }
}

export function fbSubscribeVisaProcs(
  cb: (list: VisaProcIndexEntry[]) => void,
): Unsubscribe {
  return subDoc(VISA_PROC_INDEX_DOC, (s) => {
    cb(s.exists() ? ((s.data().items as VisaProcIndexEntry[]) ?? []) : []);
  });
}

// ── Dự án visa (Visa Projects) ──
// Lưu toàn bộ trong MỘT doc (mảng) như ncc_master/contracts_master, để dùng được
// dưới rules hiện hành (viettours/* được phép) và né blocker deploy rules. Lưu ý
// giới hạn 1 MB/doc — attachments chỉ là tham chiếu {key,name} nên dư sức.
const VISA_PROJECTS_DOC = doc(db, 'viettours', 'visa_projects');

export function fbSubscribeVisaProjects(cb: (list: VisaProjectDoc[]) => void): Unsubscribe {
  return subDoc(VISA_PROJECTS_DOC, (s) => {
    cb(s.exists() ? ((s.data().projects as VisaProjectDoc[]) ?? []) : []);
  });
}

export async function fbPushVisaProjects(
  list: VisaProjectDoc[],
  pushedBy: { name: string; role: string },
): Promise<void> {
  await setDoc(VISA_PROJECTS_DOC, {
    projects: list,
    updatedAt: new Date().toISOString(),
    updatedBy: `${pushedBy.name} (${pushedBy.role})`,
  });
}

// ── Thư viện thuyết minh điểm tham quan (single-doc, dùng chung) ──
const POI_LIBRARY_DOC = doc(db, 'viettours', 'poi_library');

export function fbSubscribePois(cb: (list: PoiEntry[]) => void): Unsubscribe {
  return subDoc(POI_LIBRARY_DOC, (s) => {
    cb(s.exists() ? ((s.data().pois as PoiEntry[]) ?? []) : []);
  });
}

export async function fbPushPois(
  list: PoiEntry[],
  pushedBy: { name: string; role: string },
): Promise<void> {
  await setDoc(POI_LIBRARY_DOC, {
    pois: list,
    updatedAt: new Date().toISOString(),
    updatedBy: `${pushedBy.name} (${pushedBy.role})`,
  });
}

// ── Lịch đi tour HDV (single-doc, dùng chung) ──
const GUIDE_SCHEDULE_DOC = doc(db, 'viettours', 'guide_schedule');

export function fbSubscribeGuideSchedule(cb: (d: GuideScheduleDoc) => void): Unsubscribe {
  return subDoc(GUIDE_SCHEDULE_DOC, (s) => {
    const data = s.exists() ? (s.data() as Partial<GuideScheduleDoc>) : undefined;
    cb({
      freelancers: data?.freelancers ?? [],
      assignments: data?.assignments ?? {},
      updatedAt: data?.updatedAt,
      updatedBy: data?.updatedBy,
    });
  });
}

export async function fbPushGuideSchedule(
  d: GuideScheduleDoc,
  pushedBy: { name: string; role: string },
): Promise<void> {
  await setDoc(GUIDE_SCHEDULE_DOC, {
    freelancers: d.freelancers ?? [],
    assignments: d.assignments ?? {},
    updatedAt: new Date().toISOString(),
    updatedBy: `${pushedBy.name} (${pushedBy.role})`,
  });
}

// ── Công việc (To-Do) — single-doc dùng chung ──
const TODOS_DOC = doc(db, 'viettours', 'todos');

export function fbSubscribeTodos(cb: (list: Todo[]) => void): Unsubscribe {
  return subDoc(TODOS_DOC, (s) => {
    cb(s.exists() ? ((s.data().todos as Todo[]) ?? []) : []);
  });
}

export async function fbPushTodos(list: Todo[], pushedBy: { name: string; role: string }): Promise<void> {
  await setDoc(TODOS_DOC, {
    todos: list,
    updatedAt: new Date().toISOString(),
    updatedBy: `${pushedBy.name} (${pushedBy.role})`,
  });
}

// ── Báo giá chia sẻ công khai cho khách (public_quotes/{token}) ──
const publicQuoteDoc = (token: string) => doc(db, 'public_quotes', token);

/** Xuất bản (ghi đè) bản báo giá hướng khách. */
export async function fbPublishQuote(d: PublicQuoteDoc): Promise<void> {
  await setDoc(publicQuoteDoc(d.token), d);
}

/** Đọc bản công khai — KHÔNG cần đăng nhập (rules cho phép read công khai). */
export async function fbGetPublicQuote(token: string): Promise<PublicQuoteDoc | null> {
  const s = await getDoc(publicQuoteDoc(token));
  return s.exists() ? (s.data() as PublicQuoteDoc) : null;
}

/** Khách bấm "Đồng ý" — chỉ ghi trường `acceptance` (rules giới hạn). */
export async function fbAcceptPublicQuote(token: string, acceptance: PublicQuoteDoc['acceptance']): Promise<void> {
  await setDoc(publicQuoteDoc(token), { acceptance }, { merge: true });
}

/** Gỡ chia sẻ. */
export async function fbUnpublishQuote(token: string): Promise<void> {
  await deleteDoc(publicQuoteDoc(token));
}

// ── Liên kết email Outlook ↔ khách hàng/báo giá (single-doc, dùng chung) ──
const EMAIL_LINKS_DOC = doc(db, 'viettours', 'email_links');

export function fbSubscribeEmailLinks(cb: (list: EmailLink[]) => void): Unsubscribe {
  return subDoc(EMAIL_LINKS_DOC, (s) => {
    cb(s.exists() ? ((s.data().links as EmailLink[]) ?? []) : []);
  });
}

export async function fbPushEmailLinks(
  list: EmailLink[],
  pushedBy: { name: string; role: string },
): Promise<void> {
  await setDoc(EMAIL_LINKS_DOC, {
    links: list,
    updatedAt: new Date().toISOString(),
    updatedBy: `${pushedBy.name} (${pushedBy.role})`,
  });
}

// ── Catalog sản phẩm NCC (single-doc, dùng chung) ──
const NCC_PRODUCTS_DOC = doc(db, 'viettours', 'ncc_products');

export function fbSubscribeNccProducts(cb: (list: NccProduct[]) => void): Unsubscribe {
  return subDoc(NCC_PRODUCTS_DOC, (s) => {
    cb(s.exists() ? ((s.data().products as NccProduct[]) ?? []) : []);
  });
}

export async function fbPushNccProducts(
  list: NccProduct[],
  pushedBy: { name: string; role: string },
): Promise<void> {
  await setDoc(NCC_PRODUCTS_DOC, {
    products: list,
    updatedAt: new Date().toISOString(),
    updatedBy: `${pushedBy.name} (${pushedBy.role})`,
  });
}
