import { vi } from 'vitest';

// Real `sb` is a SupabaseClient; unit tests never hit the network.
export const sb = {} as unknown;

// Auth gateway (Task 3 adds the real ones; the stub keeps unit imports cheap).
export const sbSendSignInLink = vi.fn(async () => {});
export const sbIsSignInLink = vi.fn(() => false);
export const sbCompleteSignInLink = vi.fn(async () => {});
export const sbSignInWithPassword = vi.fn(async () => {});
export const sbSignOut = vi.fn(async () => {});
export const sbOnAuthChange = vi.fn(() => () => {});
export const sbGetProfileById = vi.fn(async () => null);
export const sbGetAccessToken = vi.fn(async () => null);
export const sbPullUsers = vi.fn(async () => []);
export const sbPushUsers = vi.fn(async () => {});
export const sbPurgeLegacyPasswords = vi.fn(async () => 0);
