import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeHrEmployees, sbPushHrEmployees } from '@/lib/supabase';
import { useAuthStore } from './authStore';
import { useTrainingStore } from './trainingStore';
import { toast } from './toastStore';
import type { HrEmployee } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type HrState = {
  employees: HrEmployee[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  /** Tạo mới (id rỗng) hoặc cập nhật (id đã có) một hồ sơ nhân viên. */
  save: (form: HrEmployee) => Promise<void>;
  delete: (id: string) => Promise<void>;
};

const newId = () => 'hr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const useHrStore = create<HrState>()(
  subscribeWithSelector((set, get) => ({
    employees: [],
    loading: false,
    syncing: false,

    init: () => {
      set({ loading: true });
      return sbSubscribeHrEmployees((list) => {
        set({ employees: list, loading: false });
      });
    },

    save: async (form) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const { employees } = get();
      const isNew = !form.id || !employees.find((e) => e.id === form.id);
      const now = new Date().toISOString();
      const created: HrEmployee | null = isNew
        ? { ...form, id: form.id || newId(), createdAt: now, createdBy: u.name }
        : null;
      const next = created
        ? [created, ...employees]
        : employees.map((e) => (e.id === form.id ? { ...form, updatedAt: now, updatedBy: u.name } : e));
      set({ employees: next, syncing: true });
      try {
        await sbPushHrEmployees(next, { name: u.name, role: u.role });
        // Tự ghi danh đào tạo cho nhân viên MỚI nếu phòng ban có chương trình.
        if (created) {
          try {
            const program = await useTrainingStore.getState().enrollEmployee(created);
            if (program) toast(`Đã tự ghi danh ${created.fullName} vào đào tạo "${program.name}"`, 'success');
          } catch { /* không chặn việc lưu nhân sự nếu auto-enroll lỗi */ }
        }
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ nhân sự: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    delete: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().employees.filter((e) => e.id !== id);
      set({ employees: next, syncing: true });
      try {
        await sbPushHrEmployees(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi xoá nhân sự: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },
  })),
);
