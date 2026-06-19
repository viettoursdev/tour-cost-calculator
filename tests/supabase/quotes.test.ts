import { describe, it, expect, beforeEach } from 'vitest';
import { getServiceClient, getViettoursClient, truncate } from './_setup';
import {
  generateQuoteCode,
  sbSaveQuote,
  sbSaveDMCQuote,
  sbSubscribeQuoteHistory,
  sbSubscribeDMCQuoteHistory,
  sbSaveQuoteState,
  sbSaveDMCQuoteState,
  sbGetQuoteProject,
  sbGetDMCQuoteProject,
  sbDeleteQuote,
  sbDeleteDMCQuote,
  sbUpdateCollaborators,
  sbUpdateDMCCollaborators,
  sbSetRegularEntryLink,
  sbSetDMCEntryLink,
  sbSetQuoteStatus,
  sbSetDMCQuoteStatus,
  sbBackfillWorkflowIndex,
  sbSetQuotePaymentSummary,
  sbBackfillPaymentIndex,
} from '../../src/lib/supabase';
import type { CloudQuoteEntry, QuoteDraft, Collaborator } from '../../src/types/quote';

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

// ── helpers ────────────────────────────────────────────────────────────────────

/** Build a realistic full QuoteDraft with items / flights / workflow / groups / payments. */
const makeDraft = (overrides: Partial<QuoteDraft> = {}): QuoteDraft => ({
  template: 'domestic',
  info: { name: 'Hạ Long 4N3Đ', dest: 'Quảng Ninh', days: 4, nights: 3, startDate: '2026-09-01' },
  pax: 20,
  rates: { USD: 25800, EUR: 28000 },
  margin: 12,
  vat: 8,
  svcBasis: 0,
  rounding: 1000,
  items: {
    hotel: [
      { id: 1, name: 'Vinpearl Paradise Hạ Long', note: '3 đêm', cur: 'VND', price: 2_800_000, times: 3, qtyMode: 'per_pax', customQty: 0, unit: 'đêm/pax', enabled: true, foc: false },
    ],
    transport: [
      { id: 2, name: 'Xe 45 chỗ HN–Hạ Long', note: '', cur: 'VND', price: 4_500_000, times: 2, qtyMode: 'per_group', customQty: 0, unit: 'lượt', enabled: true, foc: false },
    ],
  },
  catEnabled: { hotel: true, transport: true, flight: false, meal: false, sight: false, meeting: false, teambuild: false, gala: false, logistics: false, staff: false, insurance: false, visa: false, dmc: false, service_fee: false, event: false, other: false },
  currentQuoteId: null,
  status: 'in_progress',
  flights: [
    {
      id: 'fl-1',
      segments: [
        { date: '01SEP', flightNo: 'VJ123', airlineCode: 'VJ', airlineName: 'Vietjet Air', depAirport: 'SGN', arrAirport: 'HAN', depCity: 'TP.HCM', arrCity: 'Hà Nội', depTime: '06:00', arrTime: '08:10' },
      ],
      fares: [
        { id: 'fa-1', label: 'Economy', amount: 1_200_000, cur: 'VND' },
      ],
      note: 'Giá vé tạm tính',
    },
  ],
  workflow: [
    {
      id: 'wf-1', label: 'Xác nhận khách sạn', status: 'done', key: 'confirm_hotel',
      dueOffset: -14, startDate: '2026-08-15', dueDate: '2026-08-18', doneDate: '2026-08-17',
      assignee: 'tester', note: 'Đã xác nhận Vinpearl',
      log: [
        { at: '2026-08-17T09:00:00.000Z', by: 'Linh', action: 'Trạng thái → Hoàn tất' },
      ],
    },
  ],
  groups: [
    {
      id: 'g-1', label: '20 khách', pax: 20,
      items: {
        hotel: [{ id: 10, name: 'Phòng đôi', note: '', cur: 'VND', price: 1_400_000, times: 3, qtyMode: 'per_pax', customQty: 0, unit: '', enabled: true, foc: false }],
      },
      catEnabled: { hotel: true, transport: false, flight: false, meal: false, sight: false, meeting: false, teambuild: false, gala: false, logistics: false, staff: false, insurance: false, visa: false, dmc: false, service_fee: false, event: false, other: false },
    },
  ],
  payments: [
    { id: 'pay-1', label: 'Đợt 1 – Cọc giữ chỗ', amount: 10_000_000, note: 'Trong vòng 3 ngày sau khi confirm' },
    { id: 'pay-2', label: 'Đợt 2 – Thanh toán còn lại', amount: 0, note: 'Trước khởi hành 7 ngày' },
  ],
  ...overrides,
});

const CLOUD_ID = 'task5-test-regular';
const DMC_CLOUD_ID = 'task5-test-dmc';

// ── Task 5 tests ───────────────────────────────────────────────────────────────

describe('Task 5 — sbSaveQuoteState / sbGetQuoteProject', () => {
  beforeEach(async () => {
    await truncate([
      'quote_versions', 'quote_workflow_logs', 'quote_workflow_steps',
      'quote_flight_fares', 'quote_flight_segments', 'quote_flights',
      'quote_group_items', 'quote_groups',
      'quote_payments', 'quote_line_items',
      'quote_collaborators', 'quotes',
    ]);
  });

  it('sbSaveQuoteState: saves a full draft and sbGetQuoteProject reassembles currentState', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        cloudId: CLOUD_ID, template: 'domestic', name: 'Hạ Long 4N3Đ', pax: 20,
        totalCost: 56_000_000, status: 'in_progress',
        createdAt: '2026-06-19T00:00:00.000Z', createdByUsername: 'tester', createdByName: 'QA',
        collaborators: [], updatedAt: '2026-06-19T00:00:00.000Z', updatedBy: 'QA',
        id: 1, quoteCode: 'DL-001', customerName: undefined, customerId: undefined,
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    const draft = makeDraft();
    await sbSaveQuoteState(CLOUD_ID, draft, 'Bản đầu tiên', { name: 'QA', role: 'Sales' }, c);

    const project = await sbGetQuoteProject(CLOUD_ID, c);
    expect(project).not.toBeNull();

    const cs = project!.currentState;
    expect(cs.template).toBe('domestic');
    expect(cs.pax).toBe(20);
    expect(cs.margin).toBe(12);
    expect(cs.vat).toBe(8);
    expect(cs.info.name).toBe('Hạ Long 4N3Đ');
    expect(cs.info.startDate).toBe('2026-09-01');

    expect(cs.items.hotel).toHaveLength(1);
    expect(cs.items.hotel![0]).toMatchObject({ id: 1, name: 'Vinpearl Paradise Hạ Long', price: 2_800_000, times: 3 });
    expect(cs.items.transport).toHaveLength(1);
    expect(cs.items.transport![0]).toMatchObject({ id: 2, name: 'Xe 45 chỗ HN–Hạ Long', qtyMode: 'per_group' });

    expect(cs.flights).toHaveLength(1);
    expect(cs.flights![0].id).toBe('fl-1');
    expect(cs.flights![0].segments).toHaveLength(1);
    expect(cs.flights![0].segments[0]).toMatchObject({ flightNo: 'VJ123', depAirport: 'SGN', arrAirport: 'HAN' });
    expect(cs.flights![0].fares).toHaveLength(1);
    expect(cs.flights![0].fares[0]).toMatchObject({ label: 'Economy', amount: 1_200_000 });

    expect(cs.workflow).toHaveLength(1);
    expect(cs.workflow![0]).toMatchObject({ id: 'wf-1', label: 'Xác nhận khách sạn', status: 'done', assignee: 'tester' });
    expect(cs.workflow![0].log).toHaveLength(1);
    expect(cs.workflow![0].log![0]).toMatchObject({ by: 'Linh', action: 'Trạng thái → Hoàn tất' });

    expect(cs.groups).toHaveLength(1);
    expect(cs.groups![0].id).toBe('g-1');
    expect(cs.groups![0].items.hotel).toHaveLength(1);
    expect(cs.groups![0].items.hotel![0]).toMatchObject({ id: 10, name: 'Phòng đôi' });

    expect(cs.payments).toHaveLength(2);
    expect(cs.payments![0]).toMatchObject({ id: 'pay-1', label: 'Đợt 1 – Cọc giữ chỗ', amount: 10_000_000 });
    expect(cs.payments![1]).toMatchObject({ id: 'pay-2', label: 'Đợt 2 – Thanh toán còn lại', amount: 0 });

    expect(project!.versions).toHaveLength(1);
    expect(project!.versions[0].versionNo).toBe(1);
    expect(project!.versions[0].savedBy).toBe('QA (Sales)');
    expect(project!.versions[0].note).toBe('Bản đầu tiên');
    expect(project!.versions[0].state).toMatchObject({ template: 'domestic', pax: 20 });

    expect(project!.updatedBy).toBe('QA');
  });

  it('versions accumulate and version_no increments correctly', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        cloudId: CLOUD_ID, template: 'domestic', name: 'Trip', pax: 10, totalCost: 0,
        status: 'in_progress', createdAt: '2026-06-19T00:00:00.000Z',
        createdByUsername: 'tester', createdByName: 'QA', collaborators: [],
        updatedAt: '2026-06-19T00:00:00.000Z', updatedBy: 'QA', id: 2, quoteCode: 'DL-002',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbSaveQuoteState(CLOUD_ID, makeDraft(), undefined, { name: 'Linh', role: 'Operations' }, c);
    await sbSaveQuoteState(CLOUD_ID, makeDraft({ pax: 25 }), 'Tăng đoàn', { name: 'Tony', role: 'CEO' }, c);

    const project = await sbGetQuoteProject(CLOUD_ID, c);
    expect(project!.versions).toHaveLength(2);

    const [newest, older] = project!.versions;
    expect(newest.versionNo).toBe(2);
    expect(newest.savedBy).toBe('Tony (CEO)');
    expect(newest.note).toBe('Tăng đoàn');

    expect(older.versionNo).toBe(1);
    expect(older.savedBy).toBe('Linh (Operations)');
    expect(older.note).toBe('Phiên bản 1');
  });

  it('versions are capped at 20 (oldest trimmed)', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        cloudId: CLOUD_ID, template: 'domestic', name: 'Trip', pax: 10, totalCost: 0,
        status: 'in_progress', createdAt: '2026-06-19T00:00:00.000Z',
        createdByUsername: 'tester', createdByName: 'QA', collaborators: [],
        updatedAt: '2026-06-19T00:00:00.000Z', updatedBy: 'QA', id: 3, quoteCode: 'DL-003',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    for (let i = 1; i <= 22; i++) {
      await sbSaveQuoteState(
        CLOUD_ID,
        makeDraft({ pax: i }),
        `Lần ${i}`,
        { name: 'QA', role: 'Sales' },
        c,
      );
    }

    const project = await sbGetQuoteProject(CLOUD_ID, c);
    expect(project!.versions).toHaveLength(20);

    expect(project!.versions[0].versionNo).toBe(22);
    expect(project!.versions[19].versionNo).toBe(3);

    expect(project!.currentState.pax).toBe(22);
  });

  it('index total_cost is NOT zeroed by sbSaveQuoteState', async () => {
    const c = await getViettoursClient();
    const admin = getServiceClient();
    await sbSaveQuote(
      {
        cloudId: CLOUD_ID, template: 'domestic', name: 'Trip', pax: 10,
        totalCost: 99_000_000, status: 'in_progress',
        createdAt: '2026-06-19T00:00:00.000Z', createdByUsername: 'tester', createdByName: 'QA',
        collaborators: [], updatedAt: '2026-06-19T00:00:00.000Z', updatedBy: 'QA',
        id: 4, quoteCode: 'DL-004',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbSaveQuoteState(CLOUD_ID, makeDraft(), undefined, { name: 'QA', role: 'Sales' }, c);

    const { data } = await admin.from('quotes').select('total_cost').eq('cloud_id', CLOUD_ID).single();
    expect(data!.total_cost).toBe(99_000_000);
  });

  it('DMC variant: sbSaveDMCQuoteState + sbGetDMCQuoteProject round-trip under template=dmc', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        cloudId: DMC_CLOUD_ID, template: 'dmc', name: 'DMC Thailand', pax: 30, totalCost: 0,
        status: 'in_progress', createdAt: '2026-06-19T00:00:00.000Z',
        createdByUsername: 'tester', createdByName: 'QA', collaborators: [],
        updatedAt: '2026-06-19T00:00:00.000Z', updatedBy: 'QA', id: 5, quoteCode: 'DMC-001',
      },
      { name: 'QA', role: 'CEO' },
      c,
    );

    const dmcDraft = makeDraft({
      template: 'dmc',
      outputCurrency: 'USD',
      dmcMargin: { type: 'percent', value: 15 },
    });

    await sbSaveDMCQuoteState(DMC_CLOUD_ID, dmcDraft, 'DMC bản 1', { name: 'QA', role: 'CEO' }, c);

    const project = await sbGetDMCQuoteProject(DMC_CLOUD_ID, c);
    expect(project).not.toBeNull();
    expect(project!.currentState.template).toBe('dmc');
    expect(project!.currentState.outputCurrency).toBe('USD');
    expect(project!.currentState.dmcMargin).toMatchObject({ type: 'percent', value: 15 });
    expect(project!.versions).toHaveLength(1);
    expect(project!.versions[0].note).toBe('DMC bản 1');
  });

  it('sbGetQuoteProject returns null for unknown cloudId', async () => {
    const c = await getViettoursClient();
    const result = await sbGetQuoteProject('nonexistent-cloud-id', c);
    expect(result).toBeNull();
  });

  // ── M1 regression: RPC must NOT clobber index-owned name/status/depart_date ──

  it('M1 regression: sbSaveQuoteState does not overwrite index-owned name/status/departDate', async () => {
    const c = await getViettoursClient();
    const admin = getServiceClient();

    // 1. Index save with explicit name, status, departDate
    await sbSaveQuote(
      {
        cloudId: CLOUD_ID, template: 'domestic', name: 'Explicit Name',
        pax: 10, totalCost: 0, status: 'sent',
        departDate: '2026-01-01',
        createdAt: '2026-06-19T00:00:00.000Z', createdByUsername: 'tester', createdByName: 'QA',
        collaborators: [], updatedAt: '2026-06-19T00:00:00.000Z', updatedBy: 'QA',
        id: 99, quoteCode: 'DL-099',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    // 2. State save with a draft whose info.name/status/info.startDate differ from the index
    const conflictingDraft = makeDraft({
      info: { name: 'Different Draft Name', dest: 'Quảng Ninh', days: 4, nights: 3, startDate: '2026-12-31' },
      status: 'won',
    });
    await sbSaveQuoteState(CLOUD_ID, conflictingDraft, undefined, { name: 'QA', role: 'Sales' }, c);

    // 3. Assert the index still shows the original index-owned values
    const { data } = await admin
      .from('quotes')
      .select('name, status, depart_date')
      .eq('cloud_id', CLOUD_ID)
      .single();

    expect(data!.name).toBe('Explicit Name');
    expect(data!.status).toBe('sent');
    expect(data!.depart_date).toBe('2026-01-01');
  });
});

describe('Task 6 — delete + collaborators (regular + DMC)', () => {
  beforeEach(async () => {
    await truncate([
      'quote_collaborators', 'quote_versions',
      'quote_payments', 'quote_workflow_logs', 'quote_workflow_steps',
      'quote_group_items', 'quote_groups', 'quote_flight_fares',
      'quote_flight_segments', 'quote_flights', 'quote_line_items',
      'quotes',
    ]);
  });

  // ── sbUpdateCollaborators ──────────────────────────────────────────────────

  it('sbUpdateCollaborators: replaces collaborators on the quote row', async () => {
    const c = await getViettoursClient();
    // Save a regular quote first (provides the quotes row we need).
    const entry = await sbSaveQuote(
      {
        id: 1, cloudId: 'q-collab-1', quoteCode: 'DT001', name: 'Collab Test',
        template: 'domestic', pax: 10, totalCost: 5000000,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    const collabs: Collaborator[] = [
      { u: 'tester', name: 'QA Bot' },
    ];
    await sbUpdateCollaborators(entry.id, entry.cloudId, collabs, c);

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const found = list.find((e) => e.cloudId === 'q-collab-1')!;
    expect(found).toBeDefined();
    expect(found.collaborators).toHaveLength(1);
    expect(found.collaborators[0].u).toBe('tester');
    expect(found.collaborators[0].name).toBe('QA Bot');
  });

  it('sbUpdateCollaborators: handles empty collaborators list (clears existing)', async () => {
    const c = await getViettoursClient();
    const entry = await sbSaveQuote(
      {
        id: 2, cloudId: 'q-collab-2', quoteCode: 'DT002', name: 'Collab Clear',
        template: 'domestic', pax: 5, totalCost: 0,
        collaborators: [{ u: 'tester', name: 'QA Bot' }],
        createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );
    // Clear collaborators.
    await sbUpdateCollaborators(entry.id, entry.cloudId, [], c);

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const found = list.find((e) => e.cloudId === 'q-collab-2')!;
    expect(found.collaborators).toHaveLength(0);
  });

  // ── sbDeleteQuote ──────────────────────────────────────────────────────────

  it('sbDeleteQuote: removes the quote and cascades to children', async () => {
    const c = await getViettoursClient();
    const entry = await sbSaveQuote(
      {
        id: 3, cloudId: 'q-del-1', quoteCode: 'DT003', name: 'To Delete',
        template: 'domestic', pax: 2, totalCost: 1000,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );
    // Confirm it's visible before deletion.
    const before = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    expect(before.some((e) => e.cloudId === 'q-del-1')).toBe(true);

    await sbDeleteQuote(entry.id, entry.cloudId, c);

    const after = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    expect(after.some((e) => e.cloudId === 'q-del-1')).toBe(false);

    // Verify cascade: no orphaned collaborator rows.
    const admin = getServiceClient();
    const { data } = await admin.from('quote_collaborators').select('id').eq('quote_id',
      (await admin.from('quotes').select('id').eq('cloud_id', 'q-del-1').maybeSingle()).data?.id ?? '00000000-0000-0000-0000-000000000000',
    );
    expect((data ?? []).length).toBe(0);
  });

  // ── DMC variants ──────────────────────────────────────────────────────────

  it('sbDeleteDMCQuote + sbUpdateDMCCollaborators work on template=dmc rows', async () => {
    const c = await getViettoursClient();
    const entry = await sbSaveDMCQuote(
      {
        id: 4, cloudId: 'q-dmc-del-1', quoteCode: 'DMC001', name: 'DMC Del',
        template: 'dmc', pax: 8, totalCost: 20000,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbUpdateDMCCollaborators(
      entry.id, entry.cloudId,
      [{ u: 'tester', name: 'QA Bot' }],
      c,
    );
    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeDMCQuoteHistory(cb, c));
    expect(list.find((e) => e.cloudId === 'q-dmc-del-1')!.collaborators[0].u).toBe('tester');

    await sbDeleteDMCQuote(entry.id, entry.cloudId, c);
    const after = await once<CloudQuoteEntry[]>((cb) => sbSubscribeDMCQuoteHistory(cb, c));
    expect(after.some((e) => e.cloudId === 'q-dmc-del-1')).toBe(false);
  });
});

describe('Task 7 — cross-links + status (regular + DMC)', () => {
  beforeEach(async () => {
    await truncate([
      'quote_collaborators', 'quote_versions',
      'quote_payments', 'quote_workflow_logs', 'quote_workflow_steps',
      'quote_group_items', 'quote_groups', 'quote_flight_fares',
      'quote_flight_segments', 'quote_flights', 'quote_line_items',
      'quotes',
    ]);
  });

  // ── sbSetRegularEntryLink ─────────────────────────────────────────────────

  it('sbSetRegularEntryLink: sets linked_quote_id/name/template on the quotes row', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        id: 10, cloudId: 'q-link-1', quoteCode: 'DT010', name: 'Link Test',
        template: 'intl', pax: 20, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbSetRegularEntryLink('q-link-1', {
      linkedQuoteId: 'q-dmc-999',
      linkedQuoteName: 'DMC Ref',
      linkedQuoteTemplate: 'dmc',
    }, c);

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const found = list.find((e) => e.cloudId === 'q-link-1')!;
    expect(found.linkedQuoteId).toBe('q-dmc-999');
    expect(found.linkedQuoteName).toBe('DMC Ref');
    expect(found.linkedQuoteTemplate).toBe('dmc');
  });

  it('sbSetRegularEntryLink: partial update (only linkedQuoteId provided)', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        id: 11, cloudId: 'q-link-2', quoteCode: 'DT011', name: 'Partial Link',
        template: 'domestic', pax: 5, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbSetRegularEntryLink('q-link-2', { linkedQuoteId: 'q-other-1' }, c);

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const found = list.find((e) => e.cloudId === 'q-link-2')!;
    expect(found.linkedQuoteId).toBe('q-other-1');
    // name and template are undefined/null when not provided
    expect(found.linkedQuoteName ?? null).toBeNull();
    expect(found.linkedQuoteTemplate ?? null).toBeNull();
  });

  // ── sbSetDMCEntryLink ─────────────────────────────────────────────────────

  it('sbSetDMCEntryLink: sets link fields on a DMC quote', async () => {
    const c = await getViettoursClient();
    await sbSaveDMCQuote(
      {
        id: 12, cloudId: 'q-dmc-link-1', quoteCode: 'DMC010', name: 'DMC Link',
        template: 'dmc', pax: 15, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbSetDMCEntryLink('q-dmc-link-1', {
      linkedQuoteId: 'q-intl-50',
      linkedQuoteName: 'Intl 50pax',
      linkedQuoteTemplate: 'intl',
    }, c);

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeDMCQuoteHistory(cb, c));
    const found = list.find((e) => e.cloudId === 'q-dmc-link-1')!;
    expect(found.linkedQuoteId).toBe('q-intl-50');
    expect(found.linkedQuoteName).toBe('Intl 50pax');
    expect(found.linkedQuoteTemplate).toBe('intl');
  });

  // ── sbSetQuoteStatus ──────────────────────────────────────────────────────

  it('sbSetQuoteStatus: updates status on regular quote', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        id: 13, cloudId: 'q-status-1', quoteCode: 'DT013', name: 'Status Test',
        template: 'domestic', pax: 8, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbSetQuoteStatus('q-status-1', 'won', c);

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    expect(list.find((e) => e.cloudId === 'q-status-1')!.status).toBe('won');
  });

  it('sbSetQuoteStatus: sets loss_reason for not_selected; clears it for won', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        id: 14, cloudId: 'q-status-2', quoteCode: 'DT014', name: 'Loss Reason',
        template: 'domestic', pax: 3, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbSetQuoteStatus('q-status-2', 'not_selected', c, 'Giá cao hơn đối thủ');
    const list1 = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const e1 = list1.find((e) => e.cloudId === 'q-status-2')!;
    expect(e1.status).toBe('not_selected');
    expect(e1.lossReason).toBe('Giá cao hơn đối thủ');

    // Switching to a win state should clear lossReason.
    await sbSetQuoteStatus('q-status-2', 'won', c);
    const list2 = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const e2 = list2.find((e) => e.cloudId === 'q-status-2')!;
    expect(e2.status).toBe('won');
    expect(e2.lossReason ?? null).toBeNull();
  });

  it('sbSetQuoteStatus: preserves loss_reason when transitioning loss→loss without new reason (fb parity)', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        id: 16, cloudId: 'q-status-3', quoteCode: 'DT016', name: 'Loss Preserve',
        template: 'domestic', pax: 5, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    // Step 1: set not_selected with a reason
    await sbSetQuoteStatus('q-status-3', 'not_selected', c, 'Giá cao');
    const list1 = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    expect(list1.find((e) => e.cloudId === 'q-status-3')!.lossReason).toBe('Giá cao');

    // Step 2: transition loss→loss (cancelled) WITHOUT passing lossReason — must PRESERVE 'Giá cao'
    await sbSetQuoteStatus('q-status-3', 'cancelled', c);
    const list2 = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const e2 = list2.find((e) => e.cloudId === 'q-status-3')!;
    expect(e2.status).toBe('cancelled');
    expect(e2.lossReason).toBe('Giá cao'); // MUST be preserved, not erased

    // Step 3: transition to a win state — loss_reason must be cleared
    await sbSetQuoteStatus('q-status-3', 'won', c);
    const list3 = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const e3 = list3.find((e) => e.cloudId === 'q-status-3')!;
    expect(e3.status).toBe('won');
    expect(e3.lossReason ?? null).toBeNull();
  });

  // ── sbSetDMCQuoteStatus ───────────────────────────────────────────────────

  it('sbSetDMCQuoteStatus: updates status on DMC quote', async () => {
    const c = await getViettoursClient();
    await sbSaveDMCQuote(
      {
        id: 15, cloudId: 'q-dmc-status-1', quoteCode: 'DMC015', name: 'DMC Status',
        template: 'dmc', pax: 12, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbSetDMCQuoteStatus('q-dmc-status-1', 'sent', c);

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeDMCQuoteHistory(cb, c));
    expect(list.find((e) => e.cloudId === 'q-dmc-status-1')!.status).toBe('sent');
  });
});

// ── Task 8: workflow/payment backfills ─────────────────────────────────────

describe('Task 8 — workflow/payment backfills', () => {
  beforeEach(async () => {
    await truncate([
      'quote_collaborators', 'attachments', 'quote_versions',
      'quote_payments', 'quote_workflow_logs', 'quote_workflow_steps',
      'quote_group_items', 'quote_groups', 'quote_flight_fares',
      'quote_flight_segments', 'quote_flights', 'quote_line_items',
      'quotes',
    ]);
  });

  // ── sbBackfillWorkflowIndex ───────────────────────────────────────────────

  it('sbBackfillWorkflowIndex: updates workflow_due + workflow_summary + depart_date; returns count', async () => {
    const c = await getViettoursClient();

    await sbSaveQuote(
      {
        id: 20, cloudId: 'q-wf-1', quoteCode: 'DT020', name: 'WF 1',
        template: 'domestic', pax: 10, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );
    await sbSaveQuote(
      {
        id: 21, cloudId: 'q-wf-2', quoteCode: 'DT021', name: 'WF 2',
        template: 'domestic', pax: 5, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    const updates: Record<string, Pick<CloudQuoteEntry, 'workflowDue' | 'workflowSummary' | 'departDate'>> = {
      'q-wf-1': {
        workflowDue: [{ label: 'Đặt khách sạn', dueDate: '2026-07-01', assignee: 'tester' }],
        workflowSummary: { current: 'Đặt khách sạn', donePct: 30, total: 10, overdue: 1 },
        departDate: '2026-08-15',
      },
      'q-wf-2': {
        workflowDue: [],
        workflowSummary: { donePct: 100, total: 10, overdue: 0 },
        departDate: '2026-09-01',
      },
      'q-nonexistent': {
        workflowDue: [],
        workflowSummary: { donePct: 0, total: 0, overdue: 0 },
        departDate: undefined,
      },
    };

    const count = await sbBackfillWorkflowIndex(updates, c);
    // Only 2 of the 3 cloud_ids exist; count = 2.
    expect(count).toBe(2);

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const e1 = list.find((e) => e.cloudId === 'q-wf-1')!;
    const e2 = list.find((e) => e.cloudId === 'q-wf-2')!;

    expect(e1.workflowDue).toHaveLength(1);
    expect(e1.workflowDue![0].label).toBe('Đặt khách sạn');
    expect(e1.workflowSummary!.donePct).toBe(30);
    expect(e1.departDate).toBe('2026-08-15');

    expect(e2.workflowDue).toHaveLength(0);
    expect(e2.workflowSummary!.donePct).toBe(100);
    expect(e2.departDate).toBe('2026-09-01');
  });

  it('sbBackfillWorkflowIndex: returns 0 for empty updates map', async () => {
    const c = await getViettoursClient();
    const count = await sbBackfillWorkflowIndex({}, c);
    expect(count).toBe(0);
  });

  // ── sbSetQuotePaymentSummary ──────────────────────────────────────────────

  it('sbSetQuotePaymentSummary: updates payment_summary for a single quote', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        id: 22, cloudId: 'q-pay-1', quoteCode: 'DT022', name: 'Pay 1',
        template: 'domestic', pax: 8, totalCost: 10000000,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    const summary: CloudQuoteEntry['paymentSummary'] = {
      payable: 8000000, paid: 3000000, remaining: 5000000,
    };
    await sbSetQuotePaymentSummary('q-pay-1', summary, c);

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const e = list.find((e) => e.cloudId === 'q-pay-1')!;
    expect(e.paymentSummary).toMatchObject({ payable: 8000000, paid: 3000000, remaining: 5000000 });
  });

  // ── sbBackfillPaymentIndex ────────────────────────────────────────────────

  it('sbBackfillPaymentIndex: batch-updates payment_summary; returns count', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        id: 23, cloudId: 'q-pay-2', quoteCode: 'DT023', name: 'Pay 2',
        template: 'domestic', pax: 4, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );
    await sbSaveQuote(
      {
        id: 24, cloudId: 'q-pay-3', quoteCode: 'DT024', name: 'Pay 3',
        template: 'domestic', pax: 6, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    const updates: Record<string, CloudQuoteEntry['paymentSummary']> = {
      'q-pay-2': { payable: 5000000, paid: 5000000, remaining: 0 },
      'q-pay-3': { payable: 2000000, paid: 0, remaining: 2000000 },
      'q-no-such-id': { payable: 999, paid: 0, remaining: 999 },
    };

    const count = await sbBackfillPaymentIndex(updates, c);
    expect(count).toBe(2);

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const e2 = list.find((e) => e.cloudId === 'q-pay-2')!;
    const e3 = list.find((e) => e.cloudId === 'q-pay-3')!;
    expect(e2.paymentSummary!.remaining).toBe(0);
    expect(e3.paymentSummary!.remaining).toBe(2000000);
  });

  it('sbBackfillPaymentIndex: returns 0 for empty map', async () => {
    const c = await getViettoursClient();
    expect(await sbBackfillPaymentIndex({}, c)).toBe(0);
  });
});
