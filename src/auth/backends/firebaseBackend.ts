import {
  fbSendSignInLink, fbIsSignInLink, fbCompleteSignInLink, fbSignInWithPassword,
  fbSignOut, fbOnIdTokenChanged, fbPullUsers, fbPushUsers, fbPurgeLegacyPasswords, auth,
} from '@/lib/firebase';
import { PERMISSIONS } from '@/auth/PERMISSIONS';
import type { User } from '@/types';
import type { AuthBackend, AuthSession, Resolution } from '../backend';

// First sign-in by this address auto-provisions a CEO (mailbox must be tightly held).
const BOOTSTRAP_CEO_EMAIL = 'developer@viettours.com.vn';

function makeBootstrapCEO(email: string): User {
  return { u: 'developer', email, role: 'CEO', name: 'Developer', color: '#dc3250' };
}

export const firebaseBackend: AuthBackend = {
  sendSignInLink: (email) => fbSendSignInLink(email),
  isSignInLink: (url) => fbIsSignInLink(url),
  completeSignInLink: async (email, url) => { await fbCompleteSignInLink(email, url); },
  signInWithPassword: async (email, password) => { await fbSignInWithPassword(email, password); },
  signOut: () => fbSignOut(),

  subscribe: (cb) => {
    fbOnIdTokenChanged(async (fbUser) => {
      await cb(fbUser ? { uid: (fbUser as { uid: string }).uid, email: ((fbUser as { email?: string }).email ?? '').toLowerCase() } : null);
    });
  },

  resolve: async (session: AuthSession): Promise<Resolution> => {
    let cloud: User[] = [];
    try {
      cloud = await fbPullUsers();
    } catch (e) {
      console.warn('Failed to pull users:', (e as Error).message);
    }
    const email = session.email.toLowerCase();
    const match = cloud.find((u) => (u.email ?? '').toLowerCase() === email);
    if (match) {
      // Dọn mật khẩu plaintext di sản (idempotent, non-blocking).
      void fbPurgeLegacyPasswords().catch(() => { /* không chặn đăng nhập */ });
      if (!(match.role in PERMISSIONS)) console.warn(`User ${match.u} has unknown role: ${match.role}`);
      return { kind: 'ok', user: match, users: cloud };
    }
    if (email === BOOTSTRAP_CEO_EMAIL) {
      const dev = makeBootstrapCEO(email);
      const next = [...cloud, dev];
      try {
        await fbPushUsers(next);
      } catch (e) {
        console.warn('Bootstrap CEO write to user_accounts failed:', (e as Error).message);
      }
      return { kind: 'ok', user: dev, users: next };
    }
    return { kind: 'rejected', users: cloud };
  },

  pushUsers: (users) => fbPushUsers(users),
  purgeLegacyPasswords: async () => { await fbPurgeLegacyPasswords(); },
  getAccessToken: async () => (await (auth as { currentUser?: { getIdToken(): Promise<string> } }).currentUser?.getIdToken()) ?? null,
};
