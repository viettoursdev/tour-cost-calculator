import { create } from 'zustand';
import {
  sbSubscribeProcessTemplates, sbSaveProcessTemplate, sbDeleteProcessTemplate,
  sbSubscribeProcessRuns, sbSaveProcessRun, sbDeleteProcessRun,
} from '@/lib/supabase';
import type { ProcessTemplate, ProcessRun } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

export const newProcessId = (prefix: string) =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

type State = {
  /** Template ĐÃ LƯU trên DB (clone từ seed hoặc tự tạo). Seed dựng sẵn nằm ở
   *  `processSeed.ts`, gộp ở tầng UI — KHÔNG ở đây. */
  templates: ProcessTemplate[];
  runs: ProcessRun[];
  loading: boolean;
  /** Phiên chạy đang mở xem (UI state) — homepage & ProcessHub cùng dùng. */
  openRunId: string | null;
  setOpenRun: (id: string | null) => void;
  /** Đăng ký 2 subscription; trả về hàm huỷ gộp. */
  init: () => Unsubscribe;
  saveTemplate: (t: ProcessTemplate, savedBy: string) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  saveRun: (r: ProcessRun, savedBy: string) => Promise<void>;
  deleteRun: (id: string) => Promise<void>;
};

export const useProcessStore = create<State>()((set) => ({
  templates: [],
  runs: [],
  loading: true,
  openRunId: null,
  setOpenRun: (id) => set({ openRunId: id }),

  init: () => {
    set({ loading: true });
    const unsubT = sbSubscribeProcessTemplates((templates) => set({ templates, loading: false }));
    const unsubR = sbSubscribeProcessRuns((runs) => set({ runs }));
    return () => { unsubT(); unsubR(); };
  },

  saveTemplate: async (t, savedBy) => { await sbSaveProcessTemplate(t, savedBy); },
  deleteTemplate: async (id) => { await sbDeleteProcessTemplate(id); },
  saveRun: async (r, savedBy) => { await sbSaveProcessRun(r, savedBy); },
  deleteRun: async (id) => { await sbDeleteProcessRun(id); },
}));
