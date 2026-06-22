import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribePois, sbPushPois } from '@/lib/supabase';
import { useAuthStore } from './authStore';
import type { PoiEntry } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

const newId = () => 'poi' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

type State = {
  pois: PoiEntry[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  save: (poi: PoiEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Gộp nhiều {place, commentary} khi import — bỏ qua địa điểm đã có (theo tên). */
  upsertMany: (rows: { place: string; commentary: string; destination?: string }[]) => Promise<number>;
};

export const usePoiStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    pois: [],
    loading: true,
    syncing: false,

    init: () => {
      set({ loading: true });
      return sbSubscribePois((list) => set({ pois: list, loading: false }));
    },

    save: async (poi) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const { pois } = get();
      const now = new Date().toISOString();
      const isNew = !pois.find((p) => p.id === poi.id);
      const stamped: PoiEntry = isNew
        ? { ...poi, id: poi.id || newId(), createdAt: now, createdBy: u.name }
        : { ...poi, updatedAt: now, updatedBy: u.name };
      const next = isNew ? [stamped, ...pois] : pois.map((p) => (p.id === poi.id ? stamped : p));
      set({ pois: next, syncing: true });
      try { await sbPushPois(next, { name: u.name, role: u.role }); }
      catch (e) { window.alert('❌ Lỗi đồng bộ thuyết minh: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    remove: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().pois.filter((p) => p.id !== id);
      set({ pois: next, syncing: true });
      try { await sbPushPois(next, { name: u.name, role: u.role }); }
      catch (e) { window.alert('❌ Lỗi xoá: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    upsertMany: async (rows) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return 0;
      const { pois } = get();
      const existing = new Set(pois.map((p) => p.place.trim().toLowerCase()));
      const now = new Date().toISOString();
      const toAdd: PoiEntry[] = [];
      for (const r of rows) {
        const place = (r.place || '').trim();
        const commentary = (r.commentary || '').trim();
        const key = place.toLowerCase();
        if (!place || !commentary || existing.has(key)) continue;
        existing.add(key);
        toAdd.push({ id: newId() + toAdd.length, place, commentary, destination: r.destination, createdAt: now, createdBy: u.name });
      }
      if (!toAdd.length) return 0;
      const next = [...toAdd, ...pois];
      set({ pois: next, syncing: true });
      try { await sbPushPois(next, { name: u.name, role: u.role }); }
      catch (e) { window.alert('❌ Lỗi lưu thuyết minh: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
      return toAdd.length;
    },
  })),
);
