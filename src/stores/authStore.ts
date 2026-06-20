import { create } from 'zustand';
import { authBackend, type AuthSession } from '@/auth/backend';
import {
  clearSessionTracking, getSignInMethod, isExpired, setSignInMethod,
  touchLastActive, type SignInMethod,
} from '@/auth/sessionTimeout';
import type { User } from '@/types';

const ALLOWED_DOMAIN = '@viettours.com.vn';
const PENDING_EMAIL_KEY = 'vte_pending_signin_email';

function normalizeEmail(raw: string): string { return raw.trim().toLowerCase(); }
function isCompanyEmail(email: string): boolean { return normalizeEmail(email).endsWith(ALLOWED_DOMAIN); }

function persistSessionStart(username: string, method: SignInMethod | null): void {
  if (method === null) return; // already-running session (reload/refresh): keep stored values
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
    // 1. Complete an in-flight magic link.
    try {
      if (authBackend.isSignInLink(window.location.href)) {
        const stashed = localStorage.getItem(PENDING_EMAIL_KEY);
        if (!stashed) {
          set({ pendingCrossDeviceUrl: window.location.href });
        } else {
          try {
            set({ pendingSignInMethod: 'link' });
            await authBackend.completeSignInLink(stashed, window.location.href);
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

    // 2. Subscribe to auth state.
    authBackend.subscribe(async (session: AuthSession | null) => {
      if (!session) {
        set({ currentUser: null, hasHydrated: true });
        return;
      }
      const res = await authBackend.resolve(session);
      if (res.kind === 'rejected') {
        await authBackend.signOut();
        set({ currentUser: null, users: res.users, hasHydrated: true, authError: 'Email chưa được cấp quyền. Liên hệ admin.', pendingSignInMethod: null });
        return;
      }
      const { user, users } = res;
      // Existing-session expiry (link sessions only; password exempt).
      if (getSignInMethod(user.u) === 'link' && isExpired(user.u)) {
        clearSessionTracking(user.u);
        await authBackend.signOut();
        set({ currentUser: null, users, hasHydrated: true, authError: 'Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.', pendingSignInMethod: null });
        return;
      }
      persistSessionStart(user.u, get().pendingSignInMethod);
      set({ currentUser: user, users, hasHydrated: true, authError: null, pendingSignInMethod: null });
    });
  },

  requestSignInLink: async (rawEmail) => {
    const email = normalizeEmail(rawEmail);
    if (!email) return { ok: false, error: 'Vui lòng nhập email' };
    if (!isCompanyEmail(email)) return { ok: false, error: 'Vui lòng dùng email công ty (@viettours.com.vn)' };
    try {
      await authBackend.sendSignInLink(email);
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
    if (!isCompanyEmail(email)) return { ok: false, error: 'Vui lòng dùng email công ty (@viettours.com.vn)' };
    try {
      set({ pendingSignInMethod: 'link' });
      await authBackend.completeSignInLink(email, url);
      set({ pendingCrossDeviceUrl: null, pendingEmail: null });
      window.history.replaceState({}, '', window.location.pathname);
      return { ok: true };
    } catch (e) {
      set({ pendingSignInMethod: null });
      return { ok: false, error: `Không thể hoàn tất đăng nhập: ${(e as Error).message}` };
    }
  },

  signInWithPassword: async (rawEmail, password) => {
    const email = normalizeEmail(rawEmail);
    if (!email || !password) return { ok: false, error: 'Vui lòng nhập email và mật khẩu' };
    if (!isCompanyEmail(email)) return { ok: false, error: 'Vui lòng dùng email công ty (@viettours.com.vn)' };
    try {
      set({ pendingSignInMethod: 'password' });
      await authBackend.signInWithPassword(email, password);
      set({ authError: null });
      return { ok: true };
    } catch (e) {
      set({ pendingSignInMethod: null });
      return { ok: false, error: `Sai email hoặc mật khẩu (${(e as Error).message})` };
    }
  },

  cancelPendingSignIn: () => {
    localStorage.removeItem(PENDING_EMAIL_KEY);
    set({ pendingEmail: null, pendingCrossDeviceUrl: null, authError: null });
  },

  signOut: async () => {
    const u = get().currentUser?.u;
    await authBackend.signOut();
    if (u) clearSessionTracking(u);
    set({ currentUser: null, authError: null, pendingSignInMethod: null });
  },

  expireSession: async () => {
    const u = get().currentUser?.u;
    if (!u) return;
    await authBackend.signOut();
    clearSessionTracking(u);
    set({ currentUser: null, authError: 'Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.', pendingSignInMethod: null });
  },

  saveUsers: async (users) => {
    set({ users });
    await authBackend.pushUsers(users);
  },
}));
