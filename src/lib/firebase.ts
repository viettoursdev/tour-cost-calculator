import { initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import type { RateCard, RateCardDoc, User } from '@/types';

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
