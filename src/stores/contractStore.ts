import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeContracts, sbPushContracts, sbDeleteContract } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { useAuthStore } from './authStore';
import type { Contract, ContractPayment, AcceptanceRecord } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type ContractState = {
  contracts: Contract[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  save: (form: Contract) => Promise<void>;
  delete: (id: string) => Promise<void>;
  updatePayments: (id: string, payments: ContractPayment[]) => Promise<void>;
  markAcceptance: (id: string, date: string, note: string, detail?: AcceptanceRecord) => Promise<void>;
  updateStatus: (id: string, status: Contract['contractStatus']) => Promise<void>;
};

export const useContractStore = create<ContractState>()(
  subscribeWithSelector((set, get) => ({
    contracts: [],
    loading: false,
    syncing: false,

    init: () => {
      set({ loading: true });
      return sbSubscribeContracts((list) => {
        set({ contracts: list, loading: false });
      });
    },

    save: async (form) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const { contracts } = get();
      const isNew = !contracts.find((c) => c.id === form.id);
      const now = new Date().toISOString();
      const totalAmount = Math.round((form.pricePerPax || 0) * (form.contractPax || 0));

      // Recalculate payment amounts from percent (only when mode is percent).
      // Fixed-mode rows keep the user-entered amount.
      const payments = form.payments.map((p) => {
        const mode = p.mode ?? 'percent';
        if (mode === 'percent' && p.percent !== undefined) {
          return { ...p, amount: Math.round((totalAmount * p.percent) / 100) };
        }
        return p;
      });

      const saved: Contract = isNew
        ? {
            ...form,
            payments,
            id: form.id || 'hd_' + Date.now(),
            createdAt: now,
            createdBy: u.name,
          }
        : { ...form, payments, updatedAt: now, updatedBy: u.name };

      const next = isNew
        ? [...contracts, saved]
        : contracts.map((c) => (c.id === saved.id ? saved : c));

      set({ contracts: next, syncing: true });
      try {
        // Chỉ đẩy hợp đồng vừa đổi (per-row) — KHÔNG đẩy cả list, tránh
        // replaceChildren ghi đè payments của hợp đồng khác từ snapshot cũ
        // khi nhiều người sửa song song. Xem [[tcc-full-overwrite-upsert-only]].
        await sbPushContracts([saved], { name: u.name, role: u.role });
        logAudit(isNew ? 'create' : 'update', 'Hợp đồng', saved.tourName || saved.id);
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    delete: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const target = get().contracts.find((c) => c.id === id);
      const next = get().contracts.filter((c) => c.id !== id);
      set({ contracts: next, syncing: true });
      try {
        await sbDeleteContract(id); // targeted — KHÔNG full-overwrite (chống wipe song song)
        logAudit('delete', 'Hợp đồng', target?.tourName || id);
      } catch (e) {
        window.alert('❌ Lỗi xoá: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    updatePayments: async (id, payments) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const now = new Date().toISOString();
      const target = get().contracts.find((c) => c.id === id);
      if (!target) return;
      const saved = { ...target, payments, updatedAt: now, updatedBy: u.name };
      set({ contracts: get().contracts.map((c) => (c.id === id ? saved : c)), syncing: true });
      try {
        await sbPushContracts([saved], { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    markAcceptance: async (id, date, note, detail) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const now = new Date().toISOString();
      const target = get().contracts.find((c) => c.id === id);
      if (!target) return;
      const saved: Contract = {
        ...target,
        hasAcceptance: true,
        acceptanceDate: date,
        acceptanceNote: note,
        acceptance: detail ? { ...detail, issuedBy: u.name, issuedAt: now } : target.acceptance,
        contractStatus: 'completed',
        updatedAt: now,
        updatedBy: u.name,
      };
      set({ contracts: get().contracts.map((c) => (c.id === id ? saved : c)), syncing: true });
      try {
        await sbPushContracts([saved], { name: u.name, role: u.role });
        logAudit('update', 'Nghiệm thu HĐ', saved.tourName || saved.id);
      } catch (e) {
        window.alert('❌ Lỗi: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    updateStatus: async (id, status) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const now = new Date().toISOString();
      const target = get().contracts.find((c) => c.id === id);
      if (!target) return;
      const saved = { ...target, contractStatus: status, updatedAt: now, updatedBy: u.name };
      set({ contracts: get().contracts.map((c) => (c.id === id ? saved : c)), syncing: true });
      try {
        await sbPushContracts([saved], { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },
  })),
);
