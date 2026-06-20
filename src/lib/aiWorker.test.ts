import { describe, it, expect, vi } from 'vitest';

const getAccessToken = vi.fn(async (): Promise<string | null> => 'tok-123');
vi.mock('@/auth/backend', () => ({ authBackend: { getAccessToken } }));

import { __getAuthHeadersForTest } from './aiWorker';

describe('authHeaders', () => {
  it('uses the active backend access token', async () => {
    expect(await __getAuthHeadersForTest()).toEqual({ Authorization: 'Bearer tok-123' });
  });
  it('returns {} when there is no token', async () => {
    getAccessToken.mockResolvedValueOnce(null);
    expect(await __getAuthHeadersForTest()).toEqual({});
  });
});
