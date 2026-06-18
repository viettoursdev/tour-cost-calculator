import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { loadAttachments, saveAttachments } from '../../src/lib/supabase';

describe('attachments helper', () => {
  beforeEach(async () => { await truncate(['attachments']); });
  it('round-trips FileAttachment[] for a parent', async () => {
    const c = await getViettoursClient();
    await saveAttachments(c, 'ncc_product', 'p1', [
      { key: 'r2-abc', name: 'quote.pdf', uploadedBy: 'Linh', uploadedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const got = await loadAttachments(c, 'ncc_product', 'p1');
    expect(got).toEqual([
      { key: 'r2-abc', name: 'quote.pdf', uploadedBy: 'Linh', uploadedAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });
});
