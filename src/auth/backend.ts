import type { User } from '@/types';
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
  /** Returns users that could not be persisted (no auth account yet). */
  pushUsers(users: User[]): Promise<User[]>;
  purgeLegacyPasswords(): Promise<void>;
  getAccessToken(): Promise<string | null>;
}

export const authBackend: AuthBackend = supabaseBackend;
