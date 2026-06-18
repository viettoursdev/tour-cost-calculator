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

  it('saving one parent_type does not delete another type sharing the same id', async () => {
    const c = await getViettoursClient();
    await saveAttachments(c, 'ncc_product', 'shared-1', [
      { key: 'r2-ncc', name: 'ncc.pdf', uploadedBy: 'Linh', uploadedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    await saveAttachments(c, 'visa_proc', 'shared-1', [
      { key: 'r2-visa', name: 'visa.pdf', uploadedBy: 'Tuan', uploadedAt: '2026-02-01T00:00:00.000Z' },
    ]);
    const nccAtts = await loadAttachments(c, 'ncc_product', 'shared-1');
    const visaAtts = await loadAttachments(c, 'visa_proc', 'shared-1');
    expect(nccAtts).toEqual([
      { key: 'r2-ncc', name: 'ncc.pdf', uploadedBy: 'Linh', uploadedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(visaAtts).toEqual([
      { key: 'r2-visa', name: 'visa.pdf', uploadedBy: 'Tuan', uploadedAt: '2026-02-01T00:00:00.000Z' },
    ]);
  });
});
