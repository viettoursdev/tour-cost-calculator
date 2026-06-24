import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeNcc, sbUpsertNcc, sbDeleteNcc } from '@/lib/supabase';
import { useAuthStore } from './authStore';
import type { Ncc, NccContact } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type NccState = {
  suppliers: Ncc[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  save: (form: Ncc) => Promise<void>;
  importMany: (rows: Ncc[]) => Promise<number>;
  delete: (id: string) => Promise<void>;
  /** Gộp nhiều NCC trùng thành 1 (giữ `primaryId` làm bản chính), xoá các bản còn lại. */
  merge: (ids: string[], primaryId: string) => Promise<void>;
};

export const useNccStore = create<NccState>()(
  subscribeWithSelector((set, get) => ({
    suppliers: [],
    loading: false,
    syncing: false,

    init: () => {
      set({ loading: true });
      return sbSubscribeNcc((list) => {
        set({ suppliers: list, loading: false });
      });
    },

    save: async (form) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const { suppliers } = get();
      const isNew = !suppliers.find((s) => s.id === form.id);
      const now = new Date().toISOString();
      const saved: Ncc = isNew
        ? {
            ...form,
            id: form.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            createdAt: now,
            createdBy: u.name, createdByU: u.u,
          }
        : { ...form, updatedAt: now, updatedBy: u.name };
      const next = isNew
        ? [...suppliers, saved]
        : suppliers.map((s) => (s.id === form.id ? saved : s));
      set({ suppliers: next, syncing: true });
      try {
        // Ghi đúng MỘT dòng → nhanh, real-time, không đụng NCC của người khác.
        await sbUpsertNcc(saved, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    importMany: async (rows) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return 0;
      const { suppliers } = get();
      const existing = new Set(suppliers.map((s) => s.name.trim().toLowerCase()));
      const now = new Date().toISOString();
      const toAdd: Ncc[] = [];
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
      const next = [...suppliers, ...toAdd];
      set({ suppliers: next, syncing: true });
      try {
        // Chỉ thêm các dòng mới — không ghi đè NCC sẵn có.
        for (const r of toAdd) await sbUpsertNcc(r, { name: u.name, role: u.role });
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
      const next = get().suppliers.filter((s) => s.id !== id);
      set({ suppliers: next, syncing: true });
      try {
        await sbDeleteNcc(id);
      } catch (e) {
        window.alert('❌ Lỗi xoá: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    merge: async (ids, primaryId) => {
      const u = useAuthStore.getState().currentUser;
      if (!u || ids.length < 2) return;
      const { suppliers } = get();
      const idSet = new Set(ids);
      const sel = suppliers.filter((s) => idSet.has(s.id));
      if (sel.length < 2) return;
      const primary = sel.find((s) => s.id === primaryId) ?? sel[0];
      const rest = sel.filter((s) => s.id !== primary.id);
      const all = [primary, ...rest];
      const now = new Date().toISOString();
      const fill = (...vals: (string | undefined)[]) => vals.find((v) => v && v.trim()) ?? '';
      // Gộp contacts, khử trùng theo tên + SĐT.
      const seen = new Set<string>();
      const contacts: NccContact[] = [];
      for (const ct of all.flatMap((s) => s.contacts ?? [])) {
        const key = `${(ct.name ?? '').trim().toLowerCase()}|${(ct.phone ?? '').trim()}`;
        if (key === '|' || seen.has(key)) continue;
        seen.add(key);
        contacts.push(ct);
      }
      const merged: Ncc = {
        ...primary,
        sectors: [...new Set(all.flatMap((s) => s.sectors ?? []))],
        continent: primary.continent || rest.map((s) => s.continent).find((x) => x && x.trim()),
        country: primary.country || rest.map((s) => s.country).find((x) => x && x.trim()),
        location: fill(primary.location, ...rest.map((s) => s.location)),
        tours: [...new Set(all.flatMap((s) => s.tours ?? []))],
        contacts,
        note: all.map((s) => s.note?.trim()).filter(Boolean).join('\n— '),
        aiAnalysis: primary.aiAnalysis || rest.map((s) => s.aiAnalysis).find((x) => x && x.trim()),
        ratings: all.flatMap((s) => s.ratings ?? []),
        updatedAt: now,
        updatedBy: u.name,
      };
      const removeIds = new Set(rest.map((s) => s.id));
      const next = suppliers
        .filter((s) => !removeIds.has(s.id))
        .map((s) => (s.id === primary.id ? merged : s));
      set({ suppliers: next, syncing: true });
      try {
        // Cập nhật bản chính rồi xoá các bản gộp — chỉ đụng đúng các dòng liên quan.
        await sbUpsertNcc(merged, { name: u.name, role: u.role });
        for (const s of rest) await sbDeleteNcc(s.id);
      } catch (e) {
        window.alert('❌ Lỗi gộp: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },
  })),
);
