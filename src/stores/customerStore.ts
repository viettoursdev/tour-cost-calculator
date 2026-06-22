import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeCustomers, sbPushCustomers } from '@/lib/supabase';
import { useAuthStore } from './authStore';
import type { Customer, CustomerContact, CustomerInteraction, CustomerInteractionType } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type CustomerState = {
  customers: Customer[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  save: (form: Customer) => Promise<void>;
  importMany: (rows: Customer[]) => Promise<number>;
  delete: (id: string) => Promise<void>;
  /** Ghi 1 lần chăm sóc khách (CRM timeline). */
  addInteraction: (customerId: string, type: CustomerInteractionType, text: string) => Promise<void>;
  /** Xoá 1 dòng chăm sóc. */
  deleteInteraction: (customerId: string, interactionId: string) => Promise<void>;
  /** Đặt lịch hẹn liên hệ lại (+ ghi 1 dòng vào timeline). */
  setFollowUp: (customerId: string, date: string, note: string) => Promise<void>;
  /** Hoàn tất / xoá lịch hẹn liên hệ lại. */
  clearFollowUp: (customerId: string) => Promise<void>;
  /** Gộp nhiều khách trùng thành 1 (giữ `primaryId` làm bản chính), xoá các bản còn lại. */
  merge: (ids: string[], primaryId: string) => Promise<void>;
};

let iseq = 0;
const newInteractionId = () => 'ci' + Date.now().toString(36) + (iseq++).toString(36) + Math.random().toString(36).slice(2, 4);

export const useCustomerStore = create<CustomerState>()(
  subscribeWithSelector((set, get) => ({
    customers: [],
    loading: false,
    syncing: false,

    init: () => {
      set({ loading: true });
      return sbSubscribeCustomers((list) => {
        set({ customers: list, loading: false });
      });
    },

    save: async (form) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const { customers } = get();
      const isNew = !customers.find((c) => c.id === form.id);
      const now = new Date().toISOString();
      const next = isNew
        ? [
            ...customers,
            {
              ...form,
              id: form.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              createdAt: now,
              createdBy: u.name,
            },
          ]
        : customers.map((c) =>
            c.id === form.id ? { ...form, updatedAt: now, updatedBy: u.name } : c,
          );
      set({ customers: next, syncing: true });
      try {
        await sbPushCustomers(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    importMany: async (rows) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return 0;
      const { customers } = get();
      const existing = new Set(customers.map((c) => c.name.trim().toLowerCase()));
      const now = new Date().toISOString();
      const toAdd: Customer[] = [];
      for (const r of rows) {
        const key = (r.name || '').trim().toLowerCase();
        if (!key || existing.has(key)) continue; // skip blank + duplicate-by-name
        existing.add(key);
        toAdd.push({
          ...r,
          id: r.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + toAdd.length,
          createdAt: now,
          createdBy: u.name,
        });
      }
      if (!toAdd.length) return 0;
      const next = [...customers, ...toAdd];
      set({ customers: next, syncing: true });
      try {
        await sbPushCustomers(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
      return toAdd.length;
    },

    delete: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().customers.filter((c) => c.id !== id);
      set({ customers: next, syncing: true });
      try {
        await sbPushCustomers(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi xoá: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    addInteraction: async (customerId, type, text) => {
      const u = useAuthStore.getState().currentUser;
      if (!u || !text.trim()) return;
      const entry: CustomerInteraction = { id: newInteractionId(), at: new Date().toISOString(), byU: u.u, byName: u.name, type, text: text.trim() };
      const next = get().customers.map((c) =>
        c.id === customerId ? { ...c, interactions: [...(c.interactions ?? []), entry], updatedAt: entry.at, updatedBy: u.name } : c);
      set({ customers: next, syncing: true });
      try { await sbPushCustomers(next, { name: u.name, role: u.role }); }
      catch (e) { window.alert('❌ Lỗi ghi chăm sóc: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    deleteInteraction: async (customerId, interactionId) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().customers.map((c) =>
        c.id === customerId ? { ...c, interactions: (c.interactions ?? []).filter((i) => i.id !== interactionId) } : c);
      set({ customers: next, syncing: true });
      try { await sbPushCustomers(next, { name: u.name, role: u.role }); }
      catch (e) { window.alert('❌ Lỗi xoá: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    setFollowUp: async (customerId, date, note) => {
      const u = useAuthStore.getState().currentUser;
      if (!u || !date) return;
      const log: CustomerInteraction = { id: newInteractionId(), at: new Date().toISOString(), byU: u.u, byName: u.name, type: 'note', text: `📅 Hẹn liên hệ lại ${date}${note.trim() ? ` — ${note.trim()}` : ''}` };
      const next = get().customers.map((c) =>
        c.id === customerId ? { ...c, nextFollowUp: { date, note: note.trim(), byU: u.u, byName: u.name }, interactions: [...(c.interactions ?? []), log], updatedAt: log.at, updatedBy: u.name } : c);
      set({ customers: next, syncing: true });
      try { await sbPushCustomers(next, { name: u.name, role: u.role }); }
      catch (e) { window.alert('❌ Lỗi đặt lịch: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    clearFollowUp: async (customerId) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().customers.map((c) =>
        c.id === customerId ? { ...c, nextFollowUp: undefined } : c);
      set({ customers: next, syncing: true });
      try { await sbPushCustomers(next, { name: u.name, role: u.role }); }
      catch (e) { window.alert('❌ Lỗi: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    merge: async (ids, primaryId) => {
      const u = useAuthStore.getState().currentUser;
      if (!u || ids.length < 2) return;
      const { customers } = get();
      const idSet = new Set(ids);
      const sel = customers.filter((c) => idSet.has(c.id));
      if (sel.length < 2) return;
      const primary = sel.find((c) => c.id === primaryId) ?? sel[0];
      const rest = sel.filter((c) => c.id !== primary.id);
      const all = [primary, ...rest];
      const now = new Date().toISOString();
      const fill = (...vals: (string | undefined)[]) => vals.find((v) => v && v.trim()) ?? '';
      // Gộp contacts, khử trùng theo tên + SĐT.
      const seen = new Set<string>();
      const contacts: CustomerContact[] = [];
      for (const ct of all.flatMap((c) => c.contacts ?? [])) {
        const key = `${(ct.name ?? '').trim().toLowerCase()}|${(ct.phone ?? '').trim()}`;
        if (key === '|' || seen.has(key)) continue;
        seen.add(key);
        contacts.push(ct);
      }
      const merged: Customer = {
        ...primary,
        address: fill(primary.address, ...rest.map((c) => c.address)),
        taxCode: fill(primary.taxCode, ...rest.map((c) => c.taxCode)),
        source: primary.source || rest.map((c) => c.source).find((s) => s && s.trim()),
        contacts,
        tags: [...new Set(all.flatMap((c) => c.tags ?? []))],
        note: all.map((c) => c.note?.trim()).filter(Boolean).join('\n— '),
        interactions: all.flatMap((c) => c.interactions ?? []).sort((a, b) => a.at.localeCompare(b.at)),
        nextFollowUp: primary.nextFollowUp ?? rest.map((c) => c.nextFollowUp).find(Boolean),
        updatedAt: now,
        updatedBy: u.name,
      };
      const removeIds = new Set(rest.map((c) => c.id));
      const next = customers
        .filter((c) => !removeIds.has(c.id))
        .map((c) => (c.id === primary.id ? merged : c));
      set({ customers: next, syncing: true });
      try { await sbPushCustomers(next, { name: u.name, role: u.role }); }
      catch (e) { window.alert('❌ Lỗi gộp: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },
  })),
);
