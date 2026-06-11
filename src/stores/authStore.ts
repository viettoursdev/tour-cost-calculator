import { create } from 'zustand';
import {
  fbPullUsers, fbPushUsers,
  fbSendSignInLink, fbIsSignInLink, fbCompleteSignInLink, fbSignInWithPassword,
  fbSignOut, fbOnIdTokenChanged,
} from '@/lib/firebase';
import { PERMISSIONS } from '@/auth/PERMISSIONS';
import type { User } from '@/types';

const ALLOWED_DOMAIN = '@viettours.com.vn';
const PENDING_EMAIL_KEY = 'vte_pending_signin_email';

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isCompanyEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(ALLOWED_DOMAIN);
}

type SignInResult = { ok: true } | { ok: false; error: string };

type AuthState = {
  currentUser: User | null;
  users: User[];
  hasHydrated: boolean;
  pendingEmail: string | null;
  pendingCrossDeviceUrl: string | null;
  authError: string | null;

  init: () => Promise<void>;
  requestSignInLink: (email: string) => Promise<SignInResult>;
  completeCrossDeviceSignIn: (email: string) => Promise<SignInResult>;
  signInWithPassword: (email: string, password: string) => Promise<SignInResult>;
  cancelPendingSignIn: () => void;
  signOut: () => Promise<void>;
  saveUsers: (users: User[]) => Promise<void>;
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  currentUser: null,
  users: [],
  hasHydrated: false,
  pendingEmail: null,
  pendingCrossDeviceUrl: null,
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
            await fbCompleteSignInLink(stashed, window.location.href);
            localStorage.removeItem(PENDING_EMAIL_KEY);
            set({ pendingEmail: null });
          } catch (e) {
            set({ authError: `Link đăng nhập đã hết hạn hoặc đã được dùng. Hãy yêu cầu link mới. (${(e as Error).message})` });
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
      if (!match) {
        // Authed but not in user_accounts → reject.
        await fbSignOut();
        set({
          currentUser: null,
          users: cloud,
          hasHydrated: true,
          authError: 'Email chưa được cấp quyền. Liên hệ admin.',
        });
        return;
      }
      if (!(match.role in PERMISSIONS)) {
        console.warn(`User ${match.u} has unknown role: ${match.role}`);
      }
      set({ currentUser: match, users: cloud, hasHydrated: true, authError: null });
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
      set({ pendingEmail: email, authError: null });
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
    await fbSignOut();
    set({ currentUser: null, authError: null });
  },

  saveUsers: async (users) => {
    set({ users });
    await fbPushUsers(users);
  },
}));
