import { create } from 'zustand';
import {
  sbSubscribeTrainingPrograms, sbSaveTrainingProgram, sbDeleteTrainingProgram,
  sbSubscribeTrainingEnrollments, sbSaveTrainingEnrollment, sbDeleteTrainingEnrollment,
} from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { TRAINING_SEED } from '@/lib/trainingSeed';
import { pickProgramForDept, resolveLearner } from '@/lib/training';
import type { TrainingProgram, TrainingEnrollment, HrEmployee } from '@/types';
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
  /** Tự ghi danh 1 nhân viên vào chương trình khớp phòng ban (idempotent). Trả
   *  về program đã ghi danh, hoặc null nếu không có chương trình phù hợp / đã có. */
  enrollEmployee: (emp: HrEmployee) => Promise<TrainingProgram | null>;
};

export const useTrainingStore = create<State>()((set, get) => ({
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

  enrollEmployee: async (emp) => {
    const dept = emp.department;
    if (!dept) return null;
    const { programs, enrollments } = get();
    const program = pickProgramForDept([...programs, ...TRAINING_SEED], dept);
    if (!program) return null;
    if (enrollments.some((e) => e.employeeId === emp.id && e.programId === program.id)) return null;
    const me = useAuthStore.getState().currentUser;
    const learner = resolveLearner(emp, useAuthStore.getState().users);
    const e: TrainingEnrollment = {
      id: newTrainingId('te'),
      programId: program.id,
      employeeId: emp.id,
      learnerUsername: learner.u,
      learnerName: learner.name,
      department: dept,
      status: 'active',
      startDate: new Date().toISOString().slice(0, 10),
      progress: {},
      gates: {},
      createdByUsername: me?.u ?? '',
      createdByName: me?.name ?? '',
      createdAt: new Date().toISOString(),
    };
    await sbSaveTrainingEnrollment(e, me?.name ?? '');
    return program;
  },
}));
