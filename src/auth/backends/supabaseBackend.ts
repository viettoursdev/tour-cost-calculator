import {
  sbSendSignInLink, sbIsSignInLink, sbCompleteSignInLink, sbSignInWithPassword,
  sbSignOut, sbOnAuthChange, sbGetProfileById, sbGetAccessToken, sbPullUsers, sbPushUsers,
} from '@/lib/supabase';
import type { AuthBackend, AuthSession, Resolution } from '../backend';

export const supabaseBackend: AuthBackend = {
  sendSignInLink: (email) => sbSendSignInLink(email),
  isSignInLink: (url) => sbIsSignInLink(url),
  completeSignInLink: async (_email, url) => { await sbCompleteSignInLink(url); },
  signInWithPassword: (email, password) => sbSignInWithPassword(email, password),
  signOut: () => sbSignOut(),
  subscribe: (cb) => { sbOnAuthChange(cb); },

  resolve: async (session: AuthSession): Promise<Resolution> => {
    // First-login provisioning is the DB trigger (handle_new_user); the profile
    // row exists by the time this fires. No client-side bootstrap.
    const [user, users] = await Promise.all([sbGetProfileById(session.uid), sbPullUsers()]);
    if (!user) return { kind: 'rejected', users };
    return { kind: 'ok', user, users };
  },

  pushUsers: (users) => sbPushUsers(users),
  purgeLegacyPasswords: async () => { /* no plaintext password column exists in Postgres */ },
  getAccessToken: () => sbGetAccessToken(),
};
