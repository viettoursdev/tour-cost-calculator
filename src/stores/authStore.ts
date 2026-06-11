import { create } from 'zustand';
import {
  fbPullUsers, fbPushUsers,
  fbSendSignInLink, fbIsSignInLink, fbCompleteSignInLink, fbSignInWithPassword,
  fbSignOut, fbOnIdTokenChanged,
} from '@/lib/firebase';
import { PERMISSIONS } from '@/auth/PERMISSIONS';
import {
  clearSessionTracking,
  getSignInMethod,
  isExpired,
  setSignInMethod,
  touchLastActive,
  type SignInMethod,
} from '@/auth/sessionTimeout';
import type { User } from '@/types';

const ALLOWED_DOMAIN = '@viettours.com.vn';
const PENDING_EMAIL_KEY = 'vte_pending_signin_email';

// First time this email signs in we auto-provision it as CEO and push the
// addition to viettours/user_accounts. Anyone with mailbox access to this
// address gets full permissions, so it must be a tightly-held company
// mailbox (not a shared/aspirational alias). Subsequent sign-ins go through
// the normal cloud-match path.
const BOOTSTRAP_CEO_EMAIL = 'developer@viettours.com.vn';

function makeBootstrapCEO(email: string): User {
  return {
    u: 'developer',
    email,
    p: '',
    role: 'CEO',
    name: 'Developer',
    color: '#dc3250',
  };
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isCompanyEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(ALLOWED_DOMAIN);
}

function persistSessionStart(username: string, method: SignInMethod | null): void {
  if (method === null) {
    // Already-running session (e.g. token refresh on reload). Keep whatever
    // method/lastActive was stored previously; don't touch them.
    return;
  }
  setSignInMethod(username, method);
  touchLastActive(username);
}

type SignInResult = { ok: true } | { ok: false; error: string };

type AuthState = {
  currentUser: User | null;
  users: User[];
  hasHydrated: boolean;
  pendingEmail: string | null;
  pendingCrossDeviceUrl: string | null;
  pendingSignInMethod: SignInMethod | null;
  authError: string | null;

  init: () => Promise<void>;
  requestSignInLink: (email: string) => Promise<SignInResult>;
  completeCrossDeviceSignIn: (email: string) => Promise<SignInResult>;
  signInWithPassword: (email: string, password: string) => Promise<SignInResult>;
  cancelPendingSignIn: () => void;
  signOut: () => Promise<void>;
  expireSession: () => Promise<void>;
  saveUsers: (users: User[]) => Promise<void>;
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  currentUser: null,
  users: [],
  hasHydrated: false,
  pendingEmail: null,
  pendingCrossDeviceUrl: null,
  pendingSignInMethod: null,
  authError: null,

  init: async () => {
    // 1. If the URL carries a magic link, complete the sign-in.
    try {
      if (fbIsSignInLink(window.location.href)) {
        const stashed = localStorage.getItem(PENDING_EMAIL_KEY);
        if (!stashed) {
          // Different device than the one that requested the link.
          // Defer until the user re-enters their email (phishing mitigation).
          set({ pendingCrossDeviceUrl: window.location.href });
        } else {
          try {
            set({ pendingSignInMethod: 'link' });
            await fbCompleteSignInLink(stashed, window.location.href);
            localStorage.removeItem(PENDING_EMAIL_KEY);
            set({ pendingEmail: null });
          } catch (e) {
            set({ authError: `Link đăng nhập đã hết hạn hoặc đã được dùng. Hãy yêu cầu link mới. (${(e as Error).message})`, pendingSignInMethod: null });
            localStorage.removeItem(PENDING_EMAIL_KEY);
          } finally {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }
      }
    } catch (e) {
      set({ authError: `Lỗi xác thực: ${(e as Error).message}` });
    }

    // 2. Subscribe to Firebase Auth state.
    fbOnIdTokenChanged(async (fbUser) => {
      if (!fbUser) {
        set({ currentUser: null, hasHydrated: true });
        return;
      }
      let cloud: User[] = [];
      try {
        cloud = await fbPullUsers();
      } catch (e) {
        console.warn('Failed to pull users:', (e as Error).message);
      }
      const verifiedEmail = (fbUser.email ?? '').toLowerCase();
      const match = cloud.find((u) => (u.email ?? '').toLowerCase() === verifiedEmail);

      const finalizeRejection = async (msg: string) => {
        await fbSignOut();
        set({ currentUser: null, users: cloud, hasHydrated: true, authError: msg, pendingSignInMethod: null });
      };

      if (!match) {
        // Bootstrap path: auto-provision the developer CEO on first sign-in.
        if (verifiedEmail === BOOTSTRAP_CEO_EMAIL) {
          const dev = makeBootstrapCEO(verifiedEmail);
          const next = [...cloud, dev];
          try {
            await fbPushUsers(next);
          } catch (e) {
            console.warn('Bootstrap CEO write to user_accounts failed:', (e as Error).message);
          }
          persistSessionStart(dev.u, get().pendingSignInMethod);
          set({ currentUser: dev, users: next, hasHydrated: true, authError: null, pendingSignInMethod: null });
          return;
        }
        await finalizeRejection('Email chưa được cấp quyền. Liên hệ admin.');
        return;
      }
      if (!(match.role in PERMISSIONS)) {
        console.warn(`User ${match.u} has unknown role: ${match.role}`);
      }

      // Existing-session expiry check: if a prior link session for this user is
      // already past the idle window, sign them out before letting them in.
      // Password sessions are exempt.
      if (getSignInMethod(match.u) === 'link' && isExpired(match.u)) {
        clearSessionTracking(match.u);
        await finalizeRejection('Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.');
        return;
      }

      persistSessionStart(match.u, get().pendingSignInMethod);
      set({ currentUser: match, users: cloud, hasHydrated: true, authError: null, pendingSignInMethod: null });
    });
  },

  requestSignInLink: async (rawEmail) => {
    const email = normalizeEmail(rawEmail);
    if (!email) return { ok: false, error: 'Vui lòng nhập email' };
    if (!isCompanyEmail(email)) {
      return { ok: false, error: 'Vui lòng dùng email công ty (@viettours.com.vn)' };
    }
    try {
      await fbSendSignInLink(email);
      localStorage.setItem(PENDING_EMAIL_KEY, email);
      set({ pendingEmail: email, authError: null, pendingSignInMethod: 'link' });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Không gửi được link: ${(e as Error).message}` };
    }
  },

  completeCrossDeviceSignIn: async (rawEmail) => {
    const email = normalizeEmail(rawEmail);
    const url = get().pendingCrossDeviceUrl;
    if (!url) return { ok: false, error: 'Không có link đăng nhập đang chờ' };
    if (!isCompanyEmail(email)) {
      return { ok: false, error: 'Vui lòng dùng email công ty (@viettours.com.vn)' };
    }
    try {
      set({ pendingSignInMethod: 'link' });
      await fbCompleteSignInLink(email, url);
      set({ pendingCrossDeviceUrl: null, pendingEmail: null });
      window.history.replaceState({}, '', window.location.pathname);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Không thể hoàn tất đăng nhập: ${(e as Error).message}` };
    }
  },

  signInWithPassword: async (rawEmail, password) => {
    const email = normalizeEmail(rawEmail);
    if (!email || !password) return { ok: false, error: 'Vui lòng nhập email và mật khẩu' };
    if (!isCompanyEmail(email)) {
      return { ok: false, error: 'Vui lòng dùng email công ty (@viettours.com.vn)' };
    }
    try {
      set({ pendingSignInMethod: 'password' });
      await fbSignInWithPassword(email, password);
      set({ authError: null });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Sai email hoặc mật khẩu (${(e as Error).message})` };
    }
  },

  cancelPendingSignIn: () => {
    localStorage.removeItem(PENDING_EMAIL_KEY);
    set({ pendingEmail: null, pendingCrossDeviceUrl: null, authError: null });
  },

  signOut: async () => {
    const u = get().currentUser?.u;
    await fbSignOut();
    if (u) clearSessionTracking(u);
    set({ currentUser: null, authError: null, pendingSignInMethod: null });
  },

  expireSession: async () => {
    const u = get().currentUser?.u;
    if (!u) return;
    await fbSignOut();
    clearSessionTracking(u);
    set({
      currentUser: null,
      authError: 'Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.',
      pendingSignInMethod: null,
    });
  },

  saveUsers: async (users) => {
    set({ users });
    await fbPushUsers(users);
  },
}));
