import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeCustomers, sbPushCustomers, sbDeleteCustomers } from '@/lib/supabase';
import { useAuthStore } from './authStore';
import type { Customer, CustomerContact, CustomerInteraction, CustomerInteractionType } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type CustomerState = {
  customers: Customer[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  /** Lưu 1 khách. Trả `true` nếu đồng bộ thành công, `false` nếu lỗi (đã rollback). */
  save: (form: Customer) => Promise<boolean>;
  importMany: (rows: Customer[]) => Promise<number>;
  delete: (customer: Customer) => Promise<void>;
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
      if (!u) return false;
      const prev = get().customers;
      const isNew = !prev.find((c) => c.id === form.id);
      const now = new Date().toISOString();
      const next = isNew
        ? [
            ...prev,
            {
              ...form,
              id: form.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              createdAt: now,
              createdBy: u.name, createdByU: u.u,
            },
          ]
        : prev.map((c) =>
            c.id === form.id ? { ...form, updatedAt: now, updatedBy: u.name } : c,
          );
      set({ customers: next, syncing: true });
      try {
        await sbPushCustomers(next, { name: u.name, role: u.role });
        return true;
      } catch (e) {
        set({ customers: prev });   // rollback state lạc quan khi push lỗi
        window.alert('❌ Lỗi đồng bộ: ' + (e as Error).message);
        return false;
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
          createdBy: u.name, createdByU: u.u,
        });
      }
      if (!toAdd.length) return 0;
      const next = [...customers, ...toAdd];
      set({ customers: next, syncing: true });
      try {
        await sbPushCustomers(next, { name: u.name, role: u.role });
      } catch (e) {
        set({ customers }); // rollback
        window.alert('❌ Lỗi đồng bộ: ' + (e as Error).message);
        return 0;
      } finally {
        set({ syncing: false });
      }
      return toAdd.length;
    },

    delete: async (customer) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      // Xoá theo `dbId` (UUID) khi có — chắc chắn ngay cả khi `legacy_id` null,
      // và phân biệt được dòng trùng id rỗng. Không còn rebuild cả danh sách.
      const prev = get().customers;
      const next = prev.filter((c) =>
        customer.dbId ? c.dbId !== customer.dbId : c !== customer);
      set({ customers: next, syncing: true });
      try {
        await sbDeleteCustomers([customer]);
      } catch (e) {
        set({ customers: prev }); // rollback
        window.alert('❌ Lỗi xoá: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    addInteraction: async (customerId, type, text) => {
      const u = useAuthStore.getState().currentUser;
      if (!u || !text.trim()) return;
      const entry: CustomerInteraction = { id: newInteractionId(), at: new Date().toISOString(), byU: u.u, byName: u.name, type, text: text.trim() };
      const prev = get().customers;
      const next = prev.map((c) =>
        c.id === customerId ? { ...c, interactions: [...(c.interactions ?? []), entry], updatedAt: entry.at, updatedBy: u.name } : c);
      set({ customers: next, syncing: true });
      try { await sbPushCustomers(next, { name: u.name, role: u.role }); }
      catch (e) { set({ customers: prev }); window.alert('❌ Lỗi ghi chăm sóc: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    deleteInteraction: async (customerId, interactionId) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const prev = get().customers;
      const next = prev.map((c) =>
        c.id === customerId ? { ...c, interactions: (c.interactions ?? []).filter((i) => i.id !== interactionId) } : c);
      set({ customers: next, syncing: true });
      try { await sbPushCustomers(next, { name: u.name, role: u.role }); }
      catch (e) { set({ customers: prev }); window.alert('❌ Lỗi xoá: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    setFollowUp: async (customerId, date, note) => {
      const u = useAuthStore.getState().currentUser;
      if (!u || !date) return;
      const log: CustomerInteraction = { id: newInteractionId(), at: new Date().toISOString(), byU: u.u, byName: u.name, type: 'note', text: `📅 Hẹn liên hệ lại ${date}${note.trim() ? ` — ${note.trim()}` : ''}` };
      const prev = get().customers;
      const next = prev.map((c) =>
        c.id === customerId ? { ...c, nextFollowUp: { date, note: note.trim(), byU: u.u, byName: u.name }, interactions: [...(c.interactions ?? []), log], updatedAt: log.at, updatedBy: u.name } : c);
      set({ customers: next, syncing: true });
      try { await sbPushCustomers(next, { name: u.name, role: u.role }); }
      catch (e) { set({ customers: prev }); window.alert('❌ Lỗi đặt lịch: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    clearFollowUp: async (customerId) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const prev = get().customers;
      const next = prev.map((c) =>
        c.id === customerId ? { ...c, nextFollowUp: undefined } : c);
      set({ customers: next, syncing: true });
      try { await sbPushCustomers(next, { name: u.name, role: u.role }); }
      catch (e) { set({ customers: prev }); window.alert('❌ Lỗi: ' + (e as Error).message); }
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
      // Gộp travelers / files / collaborators (khử trùng theo id) để KHÔNG mất PII
      // hộ chiếu hay file của bản phụ khi gộp.
      const dedupById = <T extends { id: string }>(arr: T[]): T[] => {
        const m = new Map<string, T>();
        for (const it of arr) if (it?.id && !m.has(it.id)) m.set(it.id, it);
        return [...m.values()];
      };
      const travelers = dedupById(all.flatMap((c) => c.travelers ?? []));
      const fileSeen = new Set<string>();
      const files = all.flatMap((c) => c.files ?? [])
        .filter((f) => f?.key && !fileSeen.has(f.key) && (fileSeen.add(f.key), true));
      const collabSeen = new Set<string>();
      const collaborators = all.flatMap((c) => c.collaborators ?? [])
        .filter((cb) => cb?.u && !collabSeen.has(cb.u) && (collabSeen.add(cb.u), true));
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
        travelers: travelers.length ? travelers : undefined,
        files: files.length ? files : undefined,
        collaborators: collaborators.length ? collaborators : undefined,
        ownerU: primary.ownerU ?? rest.map((c) => c.ownerU).find(Boolean),
        ownerName: primary.ownerName ?? rest.map((c) => c.ownerName).find(Boolean),
        preferredChannel: primary.preferredChannel ?? rest.map((c) => c.preferredChannel).find(Boolean),
        birthday: primary.birthday ?? rest.map((c) => c.birthday).find(Boolean),
        paymentTerms: primary.paymentTerms ?? rest.map((c) => c.paymentTerms).find(Boolean),
        creditLimit: primary.creditLimit ?? rest.map((c) => c.creditLimit).find((v) => v != null),
        refundBank: primary.refundBank ?? rest.map((c) => c.refundBank).find(Boolean),
        updatedAt: now,
        updatedBy: u.name,
      };
      const removeIds = new Set(rest.map((c) => c.id));
      const next = customers
        .filter((c) => !removeIds.has(c.id))
        .map((c) => (c.id === primary.id ? merged : c));
      set({ customers: next, syncing: true });
      try {
        await sbPushCustomers(next, { name: u.name, role: u.role });
        // Đảm bảo xoá hẳn các bản đã gộp (kể cả dòng `legacy_id` null mà
        // delete-diff theo legacy_id của sbPushCustomers bỏ sót).
        await sbDeleteCustomers(rest);
      }
      catch (e) { set({ customers }); window.alert('❌ Lỗi gộp: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },
  })),
);
