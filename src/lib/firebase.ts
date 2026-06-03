import { initializeApp } from 'firebase/app';
import {
  deleteDoc, doc, getDoc, getFirestore, onSnapshot, setDoc, type Unsubscribe,
} from 'firebase/firestore';
import type {
  CloudQuoteEntry, CloudQuoteProject, Collaborator, QuoteDraft, RateCard, RateCardDoc,
  Template, User,
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
const quoteProjectDoc = (cloudId: string) => doc(db, 'quote_projects', cloudId);

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

/**
 * Subscribe to the cloud quote history (regular only — DMC is a separate doc).
 * Source: public/legacy.html:233.
 */
export function fbSubscribeQuoteHistory(
  cb: (quotes: CloudQuoteEntry[]) => void,
): Unsubscribe {
  return onSnapshot(QUOTE_HISTORY_DOC, (snap) => {
    cb(snap.exists() ? ((snap.data().quotes as CloudQuoteEntry[]) ?? []) : []);
  });
}

/**
 * Save or update a CloudQuoteEntry in viettours/quote_history.quotes[].
 * Existing entry: merge in-place, preserve createdBy fields and createdAt and
 * existing collaborators (unless `entry.collaborators` is provided).
 * New entry: insert at head with creator info from `savedBy`.
 * Always slices to 500 and writes back.
 * Source: public/legacy.html:307-335.
 */
export async function fbSaveQuote(
  entry: {
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
  },
  savedBy: { u: string; name: string; role: string },
): Promise<CloudQuoteEntry> {
  const nowIso = new Date().toISOString();
  const savedByLabel = `${savedBy.name} (${savedBy.role})`;
  const snap = await getDoc(QUOTE_HISTORY_DOC);
  const quotes = snap.exists() ? ((snap.data().quotes as CloudQuoteEntry[]) ?? []) : [];
  const idx = quotes.findIndex((q) => q.id === entry.id);

  let saved: CloudQuoteEntry;
  if (idx >= 0) {
    const existing = quotes[idx];
    saved = {
      ...existing,
      ...entry,
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
      customerId: entry.customerId,
      customerName: entry.customerName,
      createdByUsername: savedBy.u,
      createdByName: savedBy.name,
      collaborators: entry.collaborators ?? [],
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: savedByLabel,
    };
    quotes.unshift(saved);
  }
  await setDoc(QUOTE_HISTORY_DOC, { quotes: quotes.slice(0, 500) });
  return saved;
}

/**
 * Append a new version to quote_projects/{cloudId} and update currentState.
 * Versions capped at 20 (FIFO via .slice(-20)).
 * Source: public/legacy.html:164-176.
 */
export async function fbSaveQuoteState(
  cloudId: string,
  state: QuoteDraft,
  note: string | undefined,
  savedBy: { name: string; role: string },
): Promise<void> {
  const snap = await getDoc(quoteProjectDoc(cloudId));
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
  await setDoc(quoteProjectDoc(cloudId), {
    ...existing,
    versions,
    currentState: state,
    updatedAt: nowIso,
    updatedBy: savedBy.name,
  });
}

/**
 * Remove the entry from viettours/quote_history and best-effort delete the
 * project doc. A failed project delete is logged but does not throw.
 */
export async function fbDeleteQuote(id: number, cloudId: string): Promise<void> {
  const snap = await getDoc(QUOTE_HISTORY_DOC);
  if (snap.exists()) {
    const quotes = ((snap.data().quotes as CloudQuoteEntry[]) ?? []).filter(
      (q) => q.id !== id,
    );
    await setDoc(QUOTE_HISTORY_DOC, { quotes });
  }
  try {
    await deleteDoc(quoteProjectDoc(cloudId));
  } catch (e) {
    console.warn('fbDeleteQuote: project doc delete failed:', (e as Error).message);
  }
}

/**
 * Update collaborators on both the project doc and the history metadata entry
 * so the visibility filter picks it up immediately on either subscription.
 * Source: public/legacy.html:181-193.
 */
export async function fbUpdateCollaborators(
  id: number,
  cloudId: string,
  collaborators: Collaborator[],
): Promise<void> {
  const projSnap = await getDoc(quoteProjectDoc(cloudId));
  const existingProj = projSnap.exists() ? projSnap.data() : {};
  await setDoc(quoteProjectDoc(cloudId), { ...existingProj, collaborators });

  const histSnap = await getDoc(QUOTE_HISTORY_DOC);
  if (histSnap.exists()) {
    const quotes = ((histSnap.data().quotes as CloudQuoteEntry[]) ?? []).slice();
    const idx = quotes.findIndex((q) => q.id === id);
    if (idx >= 0) {
      quotes[idx] = { ...quotes[idx], collaborators };
      await setDoc(QUOTE_HISTORY_DOC, { quotes });
    }
  }
}

/**
 * Read a single cloud quote project doc. Returns null if missing.
 * Source: public/legacy.html:177-179.
 */
export async function fbGetQuoteProject(
  cloudId: string,
): Promise<CloudQuoteProject | null> {
  const snap = await getDoc(quoteProjectDoc(cloudId));
  return snap.exists() ? (snap.data() as CloudQuoteProject) : null;
}
