import { useEffect } from 'react';

/**
 * Gắn phím tắt Undo/Redo khi component đang mở:
 * - Undo: Ctrl/⌘ + Z
 * - Redo: Ctrl/⌘ + Y hoặc Ctrl/⌘ + Shift + Z
 * preventDefault để ưu tiên undo của app (thay vì undo gốc của ô input).
 */
export function useUndoRedoShortcuts(undo: () => void, redo: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [undo, redo, enabled]);
}
