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
export async function fbPullMasterRC(): Promise<RateCardDoc | null> {
  const snap = await getDoc(RC_DOC);
  if (!snap.exists()) return null;
  return snap.data() as RateCardDoc;
}

export async function fbPushMasterRC(rc: RateCard, pushedBy: string): Promise<void> {
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
    otherRates: rc.otherRates,
  });
}

export function fbSubscribeMasterRC(cb: (rc: RateCardDoc) => void): Unsubscribe {
  return onSnapshot(RC_DOC, (snap) => {
    if (snap.exists()) cb(snap.data() as RateCardDoc);
  });
}
