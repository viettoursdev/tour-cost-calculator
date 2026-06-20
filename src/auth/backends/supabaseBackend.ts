import type { AuthBackend } from '../backend';

const notReady = (): never => { throw new Error('supabaseBackend not implemented until Phase 3 Task 4'); };

export const supabaseBackend: AuthBackend = {
  sendSignInLink: notReady, isSignInLink: () => false, completeSignInLink: notReady,
  signInWithPassword: notReady, signOut: notReady, subscribe: () => {}, resolve: notReady,
  pushUsers: notReady, purgeLegacyPasswords: async () => {}, getAccessToken: async () => null,
};
