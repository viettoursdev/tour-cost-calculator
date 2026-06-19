import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  generateQuoteCode,
  sbSaveQuote,
  sbSaveDMCQuote,
  sbSubscribeQuoteHistory,
  sbSubscribeDMCQuoteHistory,
} from '../../src/lib/supabase';
import type { CloudQuoteEntry } from '../../src/types/quote';

const once = <T>(fn: (cb: (v: T) => void) => () => void): Promise<T> =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('quote history index (Task 4)', () => {
  beforeEach(async () => {
    await truncate(['quote_collaborators', 'attachments', 'quote_line_items',
      'quote_group_items', 'quote_groups', 'quote_payments',
      'quote_flight_fares', 'quote_flight_segments', 'quote_flights',
      'quote_workflow_logs', 'quote_workflow_steps', 'quote_versions', 'quotes']);
  });

  // ── generateQuoteCode ──────────────────────────────────────────────────────

  it('generateQuoteCode: generates prefix-seq-date code, increments per existing same-prefix', () => {
    const existing: CloudQuoteEntry[] = [];
    const code1 = generateQuoteCode('domestic', existing);
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yy = String(today.getFullYear()).slice(-2);
    expect(code1).toBe(`NĐ.01.${dd}.${mm}.${yy}`);
    // second call with code1 already in list increments seq
    const code2 = generateQuoteCode('domestic', [{ quoteCode: code1 } as CloudQuoteEntry]);
    expect(code2).toBe(`NĐ.02.${dd}.${mm}.${yy}`);
    // intl → NN prefix
    expect(generateQuoteCode('intl', [])).toMatch(/^NN\.01\./);
    // dmc → DMC prefix
    expect(generateQuoteCode('dmc', [])).toMatch(/^DMC\.01\./);
  });

  // ── sbSaveQuote (regular) ──────────────────────────────────────────────────

  it('sbSaveQuote: inserts a new row with auto-generated quote_code, returns CloudQuoteEntry', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA Tester', role: 'Sales' };

    const entry = await sbSaveQuote(
      {
        id: 1001,
        cloudId: 'qreg-1',
        name: 'Tour Hà Nội',
        template: 'domestic',
        pax: 20,
        totalCost: 50_000_000,
        status: 'draft',
        customerName: 'Acme Corp',
        collaborators: [{ u: 'tester', name: 'QA Tester' }],
        attachments: [{ key: 'r2-q1', name: 'brief.pdf', uploadedBy: 'tester', uploadedAt: '2026-06-01T00:00:00.000Z' }],
      },
      savedBy,
      c,
    );

    // returns a valid CloudQuoteEntry
    expect(entry.cloudId).toBe('qreg-1');
    expect(entry.quoteCode).toMatch(/^NĐ\.01\./);
    expect(entry.name).toBe('Tour Hà Nội');
    expect(entry.pax).toBe(20);
    expect(entry.totalCost).toBe(50_000_000);
    expect(entry.status).toBe('draft');
    expect(entry.customerName).toBe('Acme Corp');
    expect(entry.createdByUsername).toBe('tester');
    expect(entry.createdByName).toBe('QA Tester');
    expect(entry.collaborators).toEqual([{ u: 'tester', name: 'QA Tester' }]);
    expect(entry.createdAt).toBeTruthy();
    expect(entry.updatedAt).toBeTruthy();
    expect(entry.updatedBy).toBe('QA Tester (Sales)');
  });

  it('sbSaveQuote: update preserves quote_code and createdAt, applies new pax/totalCost', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA Tester', role: 'Sales' };

    const first = await sbSaveQuote(
      { id: 1002, cloudId: 'qreg-2', name: 'Tour SG', template: 'domestic', pax: 10, totalCost: 10_000_000 },
      savedBy,
      c,
    );
    const origCode = first.quoteCode;
    const origCreatedAt = first.createdAt;

    const updated = await sbSaveQuote(
      { id: 1002, cloudId: 'qreg-2', name: 'Tour SG v2', template: 'domestic', pax: 15, totalCost: 12_000_000 },
      savedBy,
      c,
    );

    expect(updated.quoteCode).toBe(origCode);         // code preserved on update
    expect(updated.createdAt).toBe(origCreatedAt);    // createdAt preserved
    expect(updated.name).toBe('Tour SG v2');
    expect(updated.pax).toBe(15);
    expect(updated.totalCost).toBe(12_000_000);
  });

  it('sbSaveQuote: second regular quote gets seq 02 (counts existing same-template rows)', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA', role: 'CEO' };
    const e1 = await sbSaveQuote(
      { id: 2001, cloudId: 'qreg-3', name: 'A', template: 'domestic', pax: 5, totalCost: 1 }, savedBy, c,
    );
    const e2 = await sbSaveQuote(
      { id: 2002, cloudId: 'qreg-4', name: 'B', template: 'domestic', pax: 5, totalCost: 1 }, savedBy, c,
    );
    expect(e1.quoteCode).toMatch(/^NĐ\.01\./);
    expect(e2.quoteCode).toMatch(/^NĐ\.02\./);
  });

  // ── sbSaveDMCQuote ─────────────────────────────────────────────────────────

  it('sbSaveDMCQuote: inserts with DMC prefix, counts only dmc-template rows for seq', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA', role: 'CEO' };
    // seed one regular quote first — must NOT affect DMC seq
    await sbSaveQuote(
      { id: 3001, cloudId: 'qreg-5', name: 'regular', template: 'domestic', pax: 5, totalCost: 1 }, savedBy, c,
    );
    const dmc = await sbSaveDMCQuote(
      { id: 4001, cloudId: 'qdmc-1', name: 'DMC Europe', template: 'dmc', pax: 30, totalCost: 200_000 },
      savedBy,
      c,
    );
    expect(dmc.quoteCode).toMatch(/^DMC\.01\./);
    expect(dmc.template).toBe('dmc');
  });

  // ── sbSubscribeQuoteHistory ────────────────────────────────────────────────

  it('sbSubscribeQuoteHistory: returns regular-only entries (excludes dmc), newest first', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA', role: 'CEO' };

    // insert one regular, one DMC
    await sbSaveQuote(
      { id: 5001, cloudId: 'qreg-6', name: 'Reg', template: 'intl', pax: 8, totalCost: 80_000 }, savedBy, c,
    );
    await sbSaveDMCQuote(
      { id: 6001, cloudId: 'qdmc-2', name: 'DMC', template: 'dmc', pax: 5, totalCost: 5_000 }, savedBy, c,
    );

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));

    expect(list.every((e) => e.template !== 'dmc')).toBe(true);
    expect(list.some((e) => e.cloudId === 'qreg-6')).toBe(true);
    expect(list.some((e) => e.cloudId === 'qdmc-2')).toBe(false);
    expect(list[0].createdAt >= (list[1]?.createdAt ?? '')).toBe(true); // newest first (or only 1 entry)
  });

  it('sbSubscribeQuoteHistory: entry includes collaborators loaded from quote_collaborators', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA', role: 'CEO' };
    await sbSaveQuote(
      {
        id: 7001, cloudId: 'qreg-7', name: 'Collab Test', template: 'domestic', pax: 1, totalCost: 1,
        collaborators: [{ u: 'alice', name: 'Alice' }, { u: 'bob', name: 'Bob' }],
      },
      savedBy,
      c,
    );

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const entry = list.find((e) => e.cloudId === 'qreg-7')!;
    expect(entry).toBeDefined();
    expect(entry.collaborators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ u: 'alice', name: 'Alice' }),
        expect.objectContaining({ u: 'bob', name: 'Bob' }),
      ]),
    );
  });

  // ── sbSubscribeDMCQuoteHistory ─────────────────────────────────────────────

  it('sbSubscribeDMCQuoteHistory: returns dmc-only entries, excludes regular', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA', role: 'CEO' };
    await sbSaveQuote(
      { id: 8001, cloudId: 'qreg-8', name: 'Reg2', template: 'domestic', pax: 1, totalCost: 1 }, savedBy, c,
    );
    await sbSaveDMCQuote(
      { id: 9001, cloudId: 'qdmc-3', name: 'DMC3', template: 'dmc', pax: 40, totalCost: 999 }, savedBy, c,
    );

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeDMCQuoteHistory(cb, c));
    expect(list.every((e) => e.template === 'dmc')).toBe(true);
    expect(list.some((e) => e.cloudId === 'qdmc-3')).toBe(true);
    expect(list.some((e) => e.cloudId === 'qreg-8')).toBe(false);
  });

  // ── Fix 1: createdByUsername on subscribe path ─────────────────────────────

  it('subscribe: createdByUsername is populated (=== saver username), not empty', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'creator_user', name: 'Creator', role: 'Sales' };
    await sbSaveQuote(
      { id: 10001, cloudId: 'qreg-u1', name: 'Username Test', template: 'domestic', pax: 1, totalCost: 1 },
      savedBy,
      c,
    );
    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const entry = list.find((e) => e.cloudId === 'qreg-u1')!;
    expect(entry).toBeDefined();
    expect(entry.createdByUsername).toBe('creator_user');
  });

  // ── Fix 1: createdByUsername preserved when a different user re-saves ──────

  it('subscribe: createdByUsername stays the original saver\'s after a re-save by a different user', async () => {
    const c = await getViettoursClient();
    const originalSaver = { u: 'original_creator', name: 'Original', role: 'Sales' };
    const anotherUser   = { u: 'another_editor', name: 'Another', role: 'Operations' };

    await sbSaveQuote(
      { id: 10002, cloudId: 'qreg-u2', name: 'Preserve Test', template: 'domestic', pax: 1, totalCost: 1 },
      originalSaver,
      c,
    );
    // Re-save (update) by a different user
    await sbSaveQuote(
      { id: 10002, cloudId: 'qreg-u2', name: 'Preserve Test v2', template: 'domestic', pax: 2, totalCost: 2 },
      anotherUser,
      c,
    );

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const entry = list.find((e) => e.cloudId === 'qreg-u2')!;
    expect(entry).toBeDefined();
    // Original creator's username must be preserved, not replaced by the editor's
    expect(entry.createdByUsername).toBe('original_creator');
  });

  // ── Fix 3: attachments loaded on subscribe path ────────────────────────────

  it('subscribe: entry saved with an attachment shows that attachment via subscribe path', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA', role: 'Sales' };
    const att = { key: 'r2-att-sub', name: 'doc.pdf', uploadedBy: 'tester', uploadedAt: '2026-06-01T00:00:00.000Z' };

    await sbSaveQuote(
      {
        id: 10003, cloudId: 'qreg-att1', name: 'Attachment Test', template: 'domestic', pax: 1, totalCost: 1,
        attachments: [att],
      },
      savedBy,
      c,
    );

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const entry = list.find((e) => e.cloudId === 'qreg-att1')!;
    expect(entry).toBeDefined();
    expect(entry.attachments).toBeDefined();
    expect(entry.attachments!.length).toBe(1);
    expect(entry.attachments![0].key).toBe('r2-att-sub');
    expect(entry.attachments![0].name).toBe('doc.pdf');
  });
});
