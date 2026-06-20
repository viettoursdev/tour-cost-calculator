import { useEffect, useRef, type ReactNode } from 'react';
import { Box, type SxProps, type Theme } from '@mui/material';
import Sortable from 'sortablejs';

/**
 * Thin React wrapper around Sortable.js. Reverts the DOM move on drop so React
 * remains the source of truth for ordering — the parent reorders state via
 * `onReorder` and React re-renders the list.
 *
 * Khi truyền `group`, nhiều danh sách cùng tên group có thể kéo-thả QUA NHAU;
 * lúc đó `onCrossMove(fromListId, fromIndex, toListId, toIndex)` được gọi (mỗi
 * container cần `listId`). Reorder trong cùng danh sách vẫn gọi `onReorder`.
 * Source: public/legacy.html:6582-6599.
 */
type Props = {
  onReorder: (from: number, to: number) => void;
  handle?: string;
  sx?: SxProps<Theme>;
  className?: string;
  deps?: React.DependencyList;
  group?: string;
  listId?: string;
  onCrossMove?: (fromListId: string, fromIndex: number, toListId: string, toIndex: number) => void;
  children: ReactNode;
};

export function SortableList({ onReorder, handle, sx, className, deps, group, listId, onCrossMove, children }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Giữ callback mới nhất để effect (deps cố định) luôn gọi đúng phiên bản.
  const onReorderRef = useRef(onReorder); onReorderRef.current = onReorder;
  const onCrossRef = useRef(onCrossMove); onCrossRef.current = onCrossMove;

  useEffect(() => {
    if (!ref.current) return;
    const s = Sortable.create(ref.current, {
      animation: 160,
      handle,
      ghostClass: 'sortable-ghost',
      ...(group ? { group } : {}),
      onEnd: (e) => {
        const from = e.from, to = e.to;
        const oldIndex = e.oldIndex, newIndex = e.newIndex;
        if (oldIndex == null || newIndex == null) return;
        // Hoàn nguyên DOM về danh sách nguồn để React làm chủ thứ tự.
        e.item.parentNode?.removeChild(e.item);
        from.insertBefore(e.item, from.children[oldIndex] ?? null);
        if (from === to) {
          if (oldIndex !== newIndex) onReorderRef.current(oldIndex, newIndex);
        } else {
          const fromId = (from as HTMLElement).dataset.listId ?? '';
          const toId = (to as HTMLElement).dataset.listId ?? '';
          onCrossRef.current?.(fromId, oldIndex, toId, newIndex);
        }
      },
    });
    return () => {
      try { s.destroy(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps ?? []);

  return (
    <Box ref={ref} className={className} data-list-id={listId} sx={sx}>
      {children}
    </Box>
  );
}
