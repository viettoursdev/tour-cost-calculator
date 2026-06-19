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
} from '../../src/lib/supabase';
import type { CloudQuoteEntry, QuoteDraft } from '../../src/types/quote';

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
});
