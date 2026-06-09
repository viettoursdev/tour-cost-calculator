import { useEffect, useRef, type ReactNode } from 'react';
import { Box, type SxProps, type Theme } from '@mui/material';
import Sortable from 'sortablejs';

/**
 * Thin React wrapper around Sortable.js. Reverts the DOM move on drop so React
 * remains the source of truth for ordering — the parent reorders state via
 * `onReorder` and React re-renders the list.
 * Source: public/legacy.html:6582-6599.
 */
type Props = {
  onReorder: (from: number, to: number) => void;
  handle?: string;
  sx?: SxProps<Theme>;
  className?: string;
  deps?: React.DependencyList;
  children: ReactNode;
};

export function SortableList({ onReorder, handle, sx, className, deps, children }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const s = Sortable.create(ref.current, {
      animation: 160,
      handle,
      ghostClass: 'sortable-ghost',
      onEnd: (e) => {
        if (e.oldIndex == null || e.newIndex == null || e.oldIndex === e.newIndex) return;
        // Revert the DOM move so React fully owns ordering.
        const parent = e.from;
        parent.removeChild(e.item);
        parent.insertBefore(e.item, parent.children[e.oldIndex] ?? null);
        onReorder(e.oldIndex, e.newIndex);
      },
    });
    return () => {
      try { s.destroy(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps ?? []);

  return (
    <Box ref={ref} className={className} sx={sx}>
      {children}
    </Box>
  );
}
