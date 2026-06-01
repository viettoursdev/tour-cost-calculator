import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fbPullUsers, fbPushUsers } from '@/lib/firebase';
import { PERMISSIONS } from '@/auth/PERMISSIONS';
import type { User } from '@/types';

const DEFAULT_USERS: User[] = [
  { u: 'ceo',      p: 'ceo123',  role: 'CEO',           name: 'Tony',  color: '#dc3250' },
  { u: 'manager1', p: 'mgr123',  role: 'Trưởng Phòng',  name: 'Mai',   color: '#f5a623' },
  { u: 'sale1',    p: 'sale123', role: 'Sales',         name: 'Linh',  color: '#14a08c' },
  { u: 'sale2',    p: 'sale123', role: 'Sales',         name: 'Hùng',  color: '#1abc9c' },
  { u: 'sale3',    p: 'sale123', role: 'Sales',         name: 'Trang', color: '#3498db' },
  { u: 'op1',      p: 'op123',   role: 'Operations',    name: 'Khang', color: '#9b59b6' },
];

type AuthState = {
  currentUser: User | null;
  users: User[];
  hasHydrated: boolean;
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
  saveUsers: (users: User[]) => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      users: DEFAULT_USERS,
      hasHydrated: false,

      init: async () => {
        try {
          const cloud = await fbPullUsers();
          const validRoles = new Set(Object.keys(PERMISSIONS));
          const unknownRoleUsers = cloud.filter((u) => !validRoles.has(u.role));
          if (unknownRoleUsers.length > 0) {
            console.warn(
              `[authStore] ${unknownRoleUsers.length} user(s) have unknown role:`,
              unknownRoleUsers.map((u) => ({ u: u.u, role: u.role })),
            );
          }
          if (cloud.length === 0) {
            // First-time migration: push local defaults up.
            await fbPushUsers(get().users);
          } else {
            // Merge: cloud wins, keep local-only users (excluding the seed CEO).
            const cloudIds = new Set(cloud.map((u) => u.u));
            const localOnly = get().users.filter(
              (u) => !cloudIds.has(u.u) && u.u !== DEFAULT_USERS[0]?.u,
            );
            const merged = [...cloud, ...localOnly];
            if (localOnly.length > 0) await fbPushUsers(merged);
            set({ users: merged });
          }
        } catch (e) {
          console.warn('User cloud sync failed:', (e as Error).message);
        } finally {
          set({ hasHydrated: true });
        }
      },

      login: async (username, password) => {
        // Always re-sync before checking, so new accounts created on other devices work.
        await get().init();
        const match = get().users.find((u) => u.u === username && u.p === password);
        if (!match) return { ok: false, error: 'Sai tài khoản hoặc mật khẩu' };
        set({ currentUser: match });
        try {
          sessionStorage.setItem('vte_s', JSON.stringify(match));
        } catch {
          /* ignore */
        }
        return { ok: true };
      },

      logout: () => {
        set({ currentUser: null });
        try {
          sessionStorage.removeItem('vte_s');
        } catch {
          /* ignore */
        }
      },

      saveUsers: async (users) => {
        set({ users });
        await fbPushUsers(users);
      },
    }),
    {
      name: 'vte_users',
      partialize: (s) => ({ users: s.users }), // persist user list only, not session
    },
  ),
);

// Restore session on module load.
try {
  const raw = sessionStorage.getItem('vte_s');
  if (raw) {
    const u = JSON.parse(raw) as User;
    useAuthStore.setState({ currentUser: u });
  }
} catch {
  /* ignore */
}
