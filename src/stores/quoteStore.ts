import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { persist, createJSONStorage } from 'zustand/middleware';
import { readUserSnapshots, readSavedQuotes, writeSavedQuotes } from '@/lib/storage';
import {
  fbDeleteQuote, fbGetQuoteProject, fbSaveQuote, fbSaveQuoteState,
  fbUpdateCollaborators,
  fbDeleteDMCQuote, fbGetDMCQuoteProject, fbSaveDMCQuote, fbSaveDMCQuoteState,
  fbUpdateDMCCollaborators,
  fbPushFxRates,
  generateQuoteCode,
} from '@/lib/firebase';
import { TEMPLATES, RATES_INIT, CATS, mkItem, DMC_CAT_IDS } from '@/components/quote/constants';
import { computeTotals } from '@/components/quote/calc';
import { useAuthStore } from './authStore';
import { useQuoteHistoryStore } from './quoteHistoryStore';
import type {
  CategoryId, CloudQuoteEntry, Collaborator, DmcMargin, Item, OutputCurrency,
  QuoteDraft, QuoteInfo, QuotePayment, QuotePricingOptions, Snapshot, Template, User,
} from '@/types';

function dmcDefaults(): Pick<QuoteDraft, 'outputCurrency' | 'dmcPrices' | 'dmcMargin'> {
  return {
    outputCurrency: 'USD',
    dmcPrices: { 20: 0, 25: 0, 30: 0, 35: 0, 40: 0 },
    dmcMargin: { type: 'percent', value: 0 },
  };
}

const EMPTY_DRAFT: QuoteDraft = {
  template: null,
  info: { name: '', dest: '', days: 1, nights: 0, startDate: null },
  pax: 20,
  rates: { ...RATES_INIT },
  margin: 5,
  vat: 8,
  svcBasis: 0,
  rounding: 100000,
  items: {},
  catEnabled: Object.fromEntries(CATS.map(c => [c.id, c.id !== 'dmc'])) as Record<CategoryId, boolean>,
  currentQuoteId: null,
};

export type QuoteViewKey =
  | 'cost' | 'summary' | 'history' | 'dashboard' | 'payment'
  | 'contract' | 'customer' | 'ncc';

type QuoteState = {
  draft: QuoteDraft;
  view: QuoteViewKey;
  snapshots: Snapshot[];
  currentUsername: string | null;
  fxSyncedAt: string | null;
  fxSyncedBy: string | null;

  init: (user: User) => void;
  reset: () => void;
  syncFxNow: () => Promise<void>;

  newDraft: (template: Template) => void;
  abandon: () => void;
  setView: (v: QuoteViewKey) => void;

  patchInfo: (patch: Partial<QuoteInfo>) => void;
  setPax: (n: number) => void;
  setRate: (cur: string, rate: number) => void;
  setRatesSynced: (rates: Record<string, number>, pushedAt?: string, pushedBy?: string, persistLocal?: boolean) => void;
  setMargin: (n: number) => void;
  setVat: (n: number) => void;
  setSvcBasis: (n: number) => void;
  setRounding: (n: number) => void;
  setInclusions: (v: string[]) => void;
  setExclusions: (v: string[]) => void;
  setPayments: (v: QuotePayment[]) => void;
  setPricingOptions: (v: QuotePricingOptions) => void;
  addGroup: () => void;
  switchGroup: (id: string) => void;
  renameGroup: (id: string, label: string) => void;
  removeGroup: (id: string) => void;
  setOutputCurrency: (cur: OutputCurrency) => void;
  setDmcPrice: (groupSize: number, value: number) => void;
  setDmcMargin: (patch: Partial<DmcMargin>) => void;

  toggleCat: (cid: CategoryId) => void;
  addItem: (cid: CategoryId, override?: Partial<Item>) => void;
  updItem: (cid: CategoryId, item: Item) => void;
  delItem: (cid: CategoryId, id: number) => void;

  exportJSON: () => string;
  importJSON: (raw: string) => { ok: true } | { ok: false; error: string };
  applyImport: (data: Partial<QuoteDraft>) => void;

  saveSnapshot: (name: string) => Snapshot;
  loadSnapshot: (id: number) => void;
  deleteSnapshot: (id: number) => void;
  renameSnapshot: (id: number, name: string) => void;

  // Cloud sync (PR-3.2)
  saveCloud: (name: string, collaborators: Collaborator[], note?: string, customer?: { id: string; name: string }, attachment?: { key: string; name: string }) => Promise<CloudQuoteEntry>;
  deleteCloud: (id: number, cloudId: string) => Promise<void>;
  updateCloudCollaborators: (id: number, cloudId: string, collabs: Collaborator[]) => Promise<void>;
  loadCloud: (cloudId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Build the persist key for a given user. Per-user scoping prevents cross-user
 * leakage on shared devices.
 */
const persistKey = (username: string) => `vte_quote_draft_${username}`;

// Shared FX rates. Editing is LOCAL only; pressing "Lưu tỷ giá" (syncFxNow)
// writes the table to the cloud doc (viettours/fx_rates) — that saved version is
// the canonical record every user adopts, and only a NEWER save overrides it.
// `lastFxPushAt` = timestamp of our own last save, so we skip our own echo and
// adopt any snapshot newer than it.
let lastFxPushAt: string | null = null;

// Keep only numeric currency entries — defends against polluted sources (e.g. a
// `{rates, at}` wrapper accidentally merged in) so `[object Object]` / timestamp
// strings never end up as a "rate".
const cleanRates = (r: Record<string, unknown>): Record<string, number> =>
  Object.fromEntries(
    Object.entries(r ?? {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)),
  ) as Record<string, number>;

// localStorage cache so rates show instantly on reload / offline, independent
// of the draft (DMC drafts are dropped on rehydrate).
const FX_LS_KEY = 'vte_fx_rates';
export function readFxRatesLS(): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(FX_LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { rates?: Record<string, number> } | Record<string, number>;
    const r = (p && typeof p === 'object' && 'rates' in p && p.rates) ? p.rates : p;
    return cleanRates(r as Record<string, unknown>);
  } catch { return null; }
}
function writeFxRatesLS(rates: Record<string, number>): void {
  try { localStorage.setItem(FX_LS_KEY, JSON.stringify({ rates: cleanRates(rates), at: new Date().toISOString() })); } catch { /* ignore */ }
}

/**
 * Internal helper: clone a draft via structuredClone for snapshot saves.
 */
const cloneDraft = (d: QuoteDraft): QuoteDraft => structuredClone(d);

/**
 * The store. The persist middleware uses a dynamic name set on init(user).
 * Trick: persist({ name: '__placeholder__', ... }) is initialized at module load;
 * we rewrite the name in init() by replacing the persist storage's getItem/setItem
 * to use the per-user key.
 */
export const useQuoteStore = create<QuoteState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        draft: EMPTY_DRAFT,
        view: 'cost',
        snapshots: [],
        currentUsername: null,
        fxSyncedAt: null,
        fxSyncedBy: null,

        init: (user) => {
          const key = persistKey(user.u);
          let storedDraft: QuoteDraft | null = null;
          let storedView: QuoteState['view'] = 'cost';
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw) as { state?: { draft?: QuoteDraft; view?: QuoteState['view'] } };
              storedDraft = parsed.state?.draft ?? null;
              if (parsed.state?.view) storedView = parsed.state.view;
            }
          } catch {
            /* ignore */
          }
          if (storedDraft?.template === 'dmc') {
            // Known issue (TODO: diagnose): rehydrating a DMC draft from localStorage
            // leaves the page visually rendered but unresponsive to clicks (no console
            // errors, root cause not yet identified). Drop the persisted draft and force
            // the template picker; also evict the bad key so the next setItem starts
            // fresh. Cloud DMC quotes (viettours/dmc_quote_history) are unaffected.
            storedDraft = null;
            try { localStorage.removeItem(key); } catch { /* ignore */ }
          }
          // Global FX rates live in their own key — apply them on top of whatever
          // draft we end up with (so DMC drafts, which are dropped above, still
          // keep the shared rate table after reload).
          const fxLS = readFxRatesLS();
          const baseDraft = storedDraft ?? EMPTY_DRAFT;
          set({
            draft: fxLS ? { ...baseDraft, rates: { ...baseDraft.rates, ...fxLS, VND: 1 } } : baseDraft,
            snapshots: readUserSnapshots(user.u),
            currentUsername: user.u,
            view: storedView,
          });
        },

        reset: () => {
          set({ draft: EMPTY_DRAFT, snapshots: [], currentUsername: null, view: 'cost' });
        },

        newDraft: (template) => {
          const tpl = TEMPLATES[template];
          // Alt templates (e.g. itinerary) skip the cost-view scaffolding entirely.
          if (tpl.kind === 'alt' || !tpl.init) {
            set({
              draft: { ...EMPTY_DRAFT, template, currentQuoteId: null },
              view: 'cost',
            });
            return;
          }
          const items = tpl.init(EMPTY_DRAFT.pax);
          const catEnabled = Object.fromEntries(
            CATS.map((c) => [
              c.id,
              template === 'dmc' ? DMC_CAT_IDS.includes(c.id) : c.id !== 'dmc',
            ]),
          ) as Record<CategoryId, boolean>;
          set({
            draft: {
              ...EMPTY_DRAFT,
              template,
              info: { ...EMPTY_DRAFT.info, ...(tpl.sample ?? {}), startDate: null },
              items,
              catEnabled,
              currentQuoteId: null,
              ...(template === 'dmc' ? dmcDefaults() : {}),
            },
            view: 'cost',
          });
        },

        abandon: () => {
          set({ draft: EMPTY_DRAFT, view: 'cost' });
        },

        setView: (v) =>
          set((s) => {
            let next: QuoteState['view'] = v;
            if (s.draft.template === 'dmc' && next !== 'cost' && next !== 'history') {
              next = 'cost';
            }
            return { view: next };
          }),

        patchInfo: (patch) =>
          set((s) => ({ draft: { ...s.draft, info: { ...s.draft.info, ...patch } } })),

        setPax: (n) => set((s) => ({ draft: { ...s.draft, pax: Math.max(1, n) } })),

        // Editing only updates the local working table; nothing is saved/synced
        // until the user presses "Lưu tỷ giá" (syncFxNow).
        setRate: (cur, rate) =>
          set((s) => ({ draft: { ...s.draft, rates: { ...s.draft.rates, [cur]: rate } } })),

        setRatesSynced: (rates, pushedAt, pushedBy, persistLocal = true) => {
          // Always record sync meta (for the "cập nhật lúc…" indicator).
          if (pushedAt || pushedBy) set({ fxSyncedAt: pushedAt ?? new Date().toISOString(), fxSyncedBy: pushedBy ?? null });
          // The latest sync is canonical: skip our own push echo (incl. earlier
          // debounced pushes) — anything at/older than our last push — and adopt
          // any snapshot newer than it. Cross-tab updates (no pushedAt) always apply.
          if (pushedAt && lastFxPushAt && pushedAt <= lastFxPushAt) return;
          set((s) => ({ draft: { ...s.draft, rates: { ...s.draft.rates, ...cleanRates(rates), VND: 1 } } }));
          // persistLocal=false when the update CAME FROM a localStorage 'storage'
          // event, to avoid a write→event→write feedback loop between tabs.
          if (persistLocal) writeFxRatesLS(get().draft.rates);
        },

        // "Lưu tỷ giá": save the current table to the cloud as the canonical
        // record for all users, and cache it locally.
        syncFxNow: async () => {
          const by = useAuthStore.getState().currentUser?.name ?? 'unknown';
          const at = await fbPushFxRates(cleanRates(get().draft.rates), by);
          lastFxPushAt = at;
          writeFxRatesLS(get().draft.rates);
          set({ fxSyncedAt: at, fxSyncedBy: by });
        },

        setMargin: (n) => set((s) => ({ draft: { ...s.draft, margin: n } })),
        setVat: (n) => set((s) => ({ draft: { ...s.draft, vat: n } })),
        setSvcBasis: (n) => set((s) => ({ draft: { ...s.draft, svcBasis: n } })),
        setRounding: (n) => set((s) => ({ draft: { ...s.draft, rounding: Math.max(1, n) } })),
        setInclusions: (v) => set((s) => ({ draft: { ...s.draft, inclusions: v } })),
        setExclusions: (v) => set((s) => ({ draft: { ...s.draft, exclusions: v } })),
        setPayments: (v) => set((s) => ({ draft: { ...s.draft, payments: v } })),
        setPricingOptions: (v) => set((s) => ({ draft: { ...s.draft, pricingOptions: v } })),

        addGroup: () => set((s) => {
          const d = s.draft;
          const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
          let groups = d.groups ? [...d.groups] : [];
          if (groups.length === 0) {
            // First time: wrap the current draft as group #1.
            groups = [{ id: genId(), label: `${d.pax} khách`, pax: d.pax, items: structuredClone(d.items), catEnabled: { ...d.catEnabled } }];
          } else {
            // Persist current edits into the active group before adding.
            groups = groups.map((g) => (g.id === d.activeGroupId
              ? { ...g, pax: d.pax, items: structuredClone(d.items), catEnabled: { ...d.catEnabled } }
              : g));
          }
          if (groups.length >= 4) return {};
          const ng = { id: genId(), label: `${d.pax} khách`, pax: d.pax, items: structuredClone(d.items), catEnabled: { ...d.catEnabled } };
          groups.push(ng);
          return { draft: { ...d, groups, activeGroupId: ng.id, pax: ng.pax, items: ng.items, catEnabled: ng.catEnabled } };
        }),

        switchGroup: (id) => set((s) => {
          const d = s.draft;
          if (!d.groups) return {};
          const groups = d.groups.map((g) => (g.id === d.activeGroupId
            ? { ...g, pax: d.pax, items: structuredClone(d.items), catEnabled: { ...d.catEnabled } }
            : g));
          const tgt = groups.find((g) => g.id === id);
          if (!tgt) return {};
          return { draft: { ...d, groups, activeGroupId: id, pax: tgt.pax, items: structuredClone(tgt.items), catEnabled: { ...tgt.catEnabled } } };
        }),

        renameGroup: (id, label) => set((s) => ({
          draft: { ...s.draft, groups: (s.draft.groups ?? []).map((g) => (g.id === id ? { ...g, label } : g)) },
        })),

        removeGroup: (id) => set((s) => {
          const d = s.draft;
          if (!d.groups) return {};
          const remaining = d.groups.filter((g) => g.id !== id);
          // Collapse back to single-group mode when ≤1 group remains.
          if (remaining.length <= 1) {
            const keep = remaining[0];
            const { groups: _g, activeGroupId: _a, ...rest } = d;
            void _g; void _a;
            if (keep && d.activeGroupId === id) {
              return { draft: { ...rest, pax: keep.pax, items: structuredClone(keep.items), catEnabled: { ...keep.catEnabled } } };
            }
            return { draft: { ...rest } };
          }
          if (d.activeGroupId === id) {
            const tgt = remaining[0];
            return { draft: { ...d, groups: remaining, activeGroupId: tgt.id, pax: tgt.pax, items: structuredClone(tgt.items), catEnabled: { ...tgt.catEnabled } } };
          }
          return { draft: { ...d, groups: remaining } };
        }),

        setOutputCurrency: (cur) =>
          set((s) => ({ draft: { ...s.draft, outputCurrency: cur } })),

        setDmcPrice: (groupSize, value) =>
          set((s) => ({
            draft: {
              ...s.draft,
              dmcPrices: { ...(s.draft.dmcPrices ?? {}), [groupSize]: value },
            },
          })),

        setDmcMargin: (patch) =>
          set((s) => ({
            draft: {
              ...s.draft,
              dmcMargin: { ...(s.draft.dmcMargin ?? { type: 'percent', value: 0 }), ...patch },
            },
          })),

        toggleCat: (cid) =>
          set((s) => ({
            draft: { ...s.draft, catEnabled: { ...s.draft.catEnabled, [cid]: !s.draft.catEnabled[cid] } },
          })),

        addItem: (cid, override = {}) => {
          set((s) => ({
            draft: {
              ...s.draft,
              items: { ...s.draft.items, [cid]: [...(s.draft.items[cid] ?? []), mkItem(override)] },
            },
          }));
        },

        updItem: (cid, item) =>
          set((s) => ({
            draft: {
              ...s.draft,
              items: {
                ...s.draft.items,
                [cid]: (s.draft.items[cid] ?? []).map((x) => (x.id === item.id ? item : x)),
              },
            },
          })),

        delItem: (cid, id) =>
          set((s) => ({
            draft: {
              ...s.draft,
              items: {
                ...s.draft.items,
                [cid]: (s.draft.items[cid] ?? []).filter((x) => x.id !== id),
              },
            },
          })),

        exportJSON: () => {
          const { draft } = get();
          const u = useAuthStore.getState().currentUser;
          const payload = {
            _meta: {
              version: '1.0',
              exportedAt: new Date().toISOString(),
              exportedBy: u ? `${u.name} (${u.role})` : 'unknown',
              app: 'Viettours Tour Cost Calculator',
            },
            ...draft,
          };
          return JSON.stringify(payload, null, 2);
        },

        importJSON: (raw) => {
          try {
            const data = JSON.parse(raw) as { _meta?: { app?: string } } & QuoteDraft;
            if (!data._meta || data._meta.app !== 'Viettours Tour Cost Calculator') {
              return { ok: false, error: 'File không phải là báo giá Viettours hợp lệ' };
            }
            // Accept any subset of fields present; missing fields keep current values.
            set((s) => ({
              draft: {
                ...s.draft,
                ...(data.template !== undefined ? { template: data.template } : {}),
                ...(data.info ? { info: data.info } : {}),
                // Clamp pax and rounding on import to the same minimums as the setters.
                // A malformed file with pax: 0 would otherwise divide-by-zero in computeTotals.
                ...(data.pax != null ? { pax: Math.max(1, Number(data.pax) || 1) } : {}),
                ...(data.rates ? { rates: data.rates } : {}),
                ...(data.margin != null ? { margin: data.margin } : {}),
                ...(data.vat != null ? { vat: data.vat } : {}),
                ...(data.svcBasis != null ? { svcBasis: data.svcBasis } : {}),
                ...(data.rounding != null ? { rounding: Math.max(1, Number(data.rounding) || 1) } : {}),
                ...(data.items ? { items: data.items } : {}),
                ...(data.catEnabled ? { catEnabled: data.catEnabled } : {}),
                ...(data.inclusions ? { inclusions: data.inclusions } : {}),
                ...(data.exclusions ? { exclusions: data.exclusions } : {}),
                ...(data.payments ? { payments: data.payments } : {}),
                ...(data.pricingOptions ? { pricingOptions: data.pricingOptions } : {}),
                ...(data.groups ? { groups: data.groups } : {}),
                ...(data.activeGroupId ? { activeGroupId: data.activeGroupId } : {}),
              },
            }));
            return { ok: true };
          } catch (e) {
            return { ok: false, error: `Lỗi đọc file: ${(e as Error).message}` };
          }
        },

        applyImport: (data) => {
          set((s) => ({
            draft: {
              ...s.draft,
              ...(data.template !== undefined ? { template: data.template } : {}),
              ...(data.info ? { info: data.info } : {}),
              ...(data.pax != null ? { pax: Math.max(1, Number(data.pax) || 1) } : {}),
              ...(data.rates ? { rates: data.rates } : {}),
              ...(data.margin != null ? { margin: data.margin } : {}),
              ...(data.vat != null ? { vat: data.vat } : {}),
              ...(data.svcBasis != null ? { svcBasis: data.svcBasis } : {}),
              ...(data.rounding != null ? { rounding: Math.max(1, Number(data.rounding) || 1) } : {}),
              ...(data.items ? { items: data.items } : {}),
              ...(data.catEnabled ? { catEnabled: data.catEnabled } : {}),
              ...(data.inclusions ? { inclusions: data.inclusions } : {}),
              ...(data.exclusions ? { exclusions: data.exclusions } : {}),
              ...(data.payments ? { payments: data.payments } : {}),
              ...(data.pricingOptions ? { pricingOptions: data.pricingOptions } : {}),
              currentQuoteId: null, // imported file starts a new quote
            },
            view: 'cost',
          }));
        },

        saveSnapshot: (name) => {
          const { draft, currentUsername } = get();
          const u = useAuthStore.getState().currentUser;
          if (!currentUsername || !u) throw new Error('Cannot save snapshot: no current user');
          const cloudId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
          const snapshot: Snapshot = {
            id: Date.now(),
            cloudId,
            name: name.trim() || draft.info.name || 'Báo giá không tên',
            date: new Date().toLocaleString('vi-VN'),
            savedBy: u.name,
            state: cloneDraft(draft),
          };
          const map = readSavedQuotes();
          const prev = map[currentUsername] ?? [];
          const next = [snapshot, ...prev].slice(0, 50);
          map[currentUsername] = next;
          writeSavedQuotes(map);
          set({ snapshots: next });
          return snapshot;
        },

        loadSnapshot: (id) => {
          const { snapshots } = get();
          const snap = snapshots.find((s) => s.id === id);
          if (!snap) return;
          set({ draft: cloneDraft(snap.state), view: 'cost' });
        },

        deleteSnapshot: (id) => {
          const { currentUsername } = get();
          if (!currentUsername) return;
          const map = readSavedQuotes();
          const next = (map[currentUsername] ?? []).filter((s) => s.id !== id);
          map[currentUsername] = next;
          writeSavedQuotes(map);
          set({ snapshots: next });
        },

        renameSnapshot: (id, name) => {
          const { currentUsername } = get();
          if (!currentUsername) return;
          const map = readSavedQuotes();
          const next = (map[currentUsername] ?? []).map((s) =>
            s.id === id ? { ...s, name: name.trim() || s.name } : s,
          );
          map[currentUsername] = next;
          writeSavedQuotes(map);
          set({ snapshots: next });
        },

        saveCloud: async (name, collaborators, note, customer, attachment) => {
          const { draft } = get();
          const u = useAuthStore.getState().currentUser;
          if (!u) throw new Error('saveCloud: no current user');
          if (!draft.template) throw new Error('saveCloud: draft has no template');
          const isDmc = draft.template === 'dmc';
          const _save  = isDmc ? fbSaveDMCQuote      : fbSaveQuote;
          const _saveS = isDmc ? fbSaveDMCQuoteState : fbSaveQuoteState;
          const totalCost = computeTotals(draft).totalCost;
          const isNew = !draft.currentQuoteId;
          const cloudId =
            draft.currentQuoteId ??
            Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
          const id = Date.now();
          const existing = isDmc
            ? useQuoteHistoryStore.getState().dmcQuotes
            : useQuoteHistoryStore.getState().quotes;
          const quoteCode = isNew ? generateQuoteCode(draft.template, existing) : undefined;
          const entry = await _save(
            {
              id,
              cloudId,
              quoteCode,
              name: name.trim() || draft.info.name || 'Báo giá không tên',
              template: draft.template,
              pax: draft.pax,
              totalCost,
              collaborators,
              ...(customer ? { customerId: customer.id, customerName: customer.name } : {}),
              ...(attachment ? { attachment } : {}),
            },
            { u: u.u, name: u.name, role: u.role },
          );
          await _saveS(cloudId, draft, note, { name: u.name, role: u.role });
          set((s) => ({ draft: { ...s.draft, currentQuoteId: cloudId } }));
          return entry;
        },

        deleteCloud: async (id, cloudId) => {
          const isDmc = get().draft.template === 'dmc';
          const _del = isDmc ? fbDeleteDMCQuote : fbDeleteQuote;
          await _del(id, cloudId);
          const { draft } = get();
          if (draft.currentQuoteId === cloudId) {
            set({ draft: { ...draft, currentQuoteId: null } });
          }
        },

        updateCloudCollaborators: async (id, cloudId, collabs) => {
          const isDmc = get().draft.template === 'dmc';
          const _col = isDmc ? fbUpdateDMCCollaborators : fbUpdateCollaborators;
          await _col(id, cloudId, collabs);
        },

        loadCloud: async (cloudId) => {
          // Try DMC first if the current draft is DMC, else regular. This matches the
          // QuoteHistoryView wiring: a user can only load quotes from the template-
          // matched history view.
          const isDmc = get().draft.template === 'dmc';
          const _get = isDmc ? fbGetDMCQuoteProject : fbGetQuoteProject;
          const project = await _get(cloudId);
          if (!project) {
            return { ok: false, error: 'Báo giá không tồn tại trong cloud' };
          }
          set({
            draft: { ...project.currentState, currentQuoteId: cloudId },
            view: 'cost',
          });
          return { ok: true };
        },
      }),
      {
        // Per-user persist: storage key is rewritten dynamically based on currentUsername.
        // We use a custom storage adapter that consults the live currentUsername at every
        // read/write so the persist middleware always targets the right key.
        name: 'vte_quote_draft_placeholder',
        partialize: (s) => ({ draft: s.draft }),
        storage: createJSONStorage(() => ({
          getItem: (_key) => {
            // The persist middleware calls this once at hydration with the placeholder key.
            // We intentionally return null here; actual hydration is done in init(user).
            return null;
          },
          setItem: (_key, value) => {
            try {
              // Look up the current username from auth store at write time.
              const u = useAuthStore.getState().currentUser;
              if (!u) return;
              localStorage.setItem(persistKey(u.u), value);
            } catch {
              /* quota / disabled storage */
            }
          },
          removeItem: (_key) => {
            try {
              const u = useAuthStore.getState().currentUser;
              if (!u) return;
              localStorage.removeItem(persistKey(u.u));
            } catch {
              /* ignore */
            }
          },
        })),
      },
    ),
  ),
);
