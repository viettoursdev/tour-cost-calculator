import type { User } from '@/types';
import { firebaseBackend } from './backends/firebaseBackend';
import { supabaseBackend } from './backends/supabaseBackend';

export type AuthSession = { uid: string; email: string };

export type Resolution =
  | { kind: 'ok'; user: User; users: User[] }
  | { kind: 'rejected'; users: User[] };

export interface AuthBackend {
  sendSignInLink(email: string): Promise<void>;
  isSignInLink(url: string): boolean;
  completeSignInLink(email: string, url: string): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  subscribe(cb: (session: AuthSession | null) => void): void;
  resolve(session: AuthSession): Promise<Resolution>;
  pushUsers(users: User[]): Promise<void>;
  purgeLegacyPasswords(): Promise<void>;
  getAccessToken(): Promise<string | null>;
}

const which = import.meta.env.VITE_AUTH_BACKEND === 'supabase' ? 'supabase' : 'firebase';

export const authBackend: AuthBackend = which === 'supabase' ? supabaseBackend : firebaseBackend;
