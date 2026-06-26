import { create } from 'zustand';
import {
  sbSubscribeTrainingPrograms, sbSaveTrainingProgram, sbDeleteTrainingProgram,
  sbSubscribeTrainingEnrollments, sbSaveTrainingEnrollment, sbDeleteTrainingEnrollment,
} from '@/lib/supabase';
import type { TrainingProgram, TrainingEnrollment } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

export const newTrainingId = (prefix: string) =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

type State = {
  /** Program ĐÃ LƯU trên DB (clone từ seed hoặc tự tạo). Seed dựng sẵn nằm ở
   *  `trainingSeed.ts`, gộp ở tầng UI — KHÔNG ở đây. */
  programs: TrainingProgram[];
  enrollments: TrainingEnrollment[];
  loading: boolean;
  init: () => Unsubscribe;
  saveProgram: (p: TrainingProgram, savedBy: string) => Promise<void>;
  deleteProgram: (id: string) => Promise<void>;
  saveEnrollment: (e: TrainingEnrollment, savedBy: string) => Promise<void>;
  deleteEnrollment: (id: string) => Promise<void>;
};

export const useTrainingStore = create<State>()((set) => ({
  programs: [],
  enrollments: [],
  loading: true,

  init: () => {
    set({ loading: true });
    const unsubP = sbSubscribeTrainingPrograms((programs) => set({ programs, loading: false }));
    const unsubE = sbSubscribeTrainingEnrollments((enrollments) => set({ enrollments }));
    return () => { unsubP(); unsubE(); };
  },

  saveProgram: async (p, savedBy) => { await sbSaveTrainingProgram(p, savedBy); },
  deleteProgram: async (id) => { await sbDeleteTrainingProgram(id); },
  saveEnrollment: async (e, savedBy) => { await sbSaveTrainingEnrollment(e, savedBy); },
  deleteEnrollment: async (id) => { await sbDeleteTrainingEnrollment(id); },
}));
