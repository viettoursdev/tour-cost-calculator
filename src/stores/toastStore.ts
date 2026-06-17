import { create } from 'zustand';

export type ToastSeverity = 'success' | 'info' | 'warning' | 'error';
export type Toast = { id: number; msg: string; severity: ToastSeverity; action?: { label: string; onClick: () => void } };

type ToastState = {
  toasts: Toast[];
  show: (msg: string, severity?: ToastSeverity, action?: Toast['action']) => number;
  dismiss: (id: number) => void;
};

let seq = 0;
export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  show: (msg, severity = 'success', action) => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, msg, severity, action }] })); // giữ tối đa 4
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Hiện toast không chặn (dùng được cả ngoài component). */
export const toast = (msg: string, severity?: ToastSeverity, action?: Toast['action']) =>
  useToastStore.getState().show(msg, severity, action);
