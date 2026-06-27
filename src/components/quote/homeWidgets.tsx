import type { ReactNode } from 'react';
import { Box, Button, Chip, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

/**
 * Thành phần trình bày dùng chung của trang "Hôm nay" — tách khỏi `HomeView` cho
 * gọn/dễ bảo trì. Đều STATELESS (không đụng store/closure component). Hằng số &
 * hàm thuần ở `homeConst.ts` (tách riêng để hợp lệ react-refresh).
 */

export function Section({ icon, title, count, color, onAll, collapsed, onToggleCollapse, children }: {
  icon: string; title: string; count: number; color: string; onAll?: () => void;
  collapsed?: boolean; onToggleCollapse?: () => void; children: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.75, borderTop: `3px solid ${color}` }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: collapsed ? 0 : 1 }}>
        <Typography fontWeight={800} fontSize={14}>{icon} {title}</Typography>
        <Chip size="small" label={count} sx={{ height: 20, fontWeight: 800, bgcolor: color + '22', color }} />
        <Box sx={{ flex: 1 }} />
        {onAll && count > 0 && !collapsed && <Button size="small" onClick={onAll} sx={{ color }}>Xem tất cả →</Button>}
        {onToggleCollapse && (
          <Tooltip title={collapsed ? 'Mở rộng' : 'Thu gọn'}>
            <IconButton size="small" onClick={onToggleCollapse} sx={{ color }}>
              {collapsed ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowUpIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      {!collapsed && (count === 0
        ? <Typography variant="caption" color="text.disabled">Không có mục nào 🎉</Typography>
        : children)}
    </Paper>
  );
}

/** Ô chỉ số nhanh trong dải KPI. */
export function Kpi({ label, value, sub, color, onClick }: { label: string; value: string; sub?: string; color: string; onClick: () => void }) {
  return (
    <Paper variant="outlined" onClick={onClick}
      sx={{ p: 1.25, cursor: 'pointer', borderTop: `3px solid ${color}`, '&:hover': { boxShadow: 1 } }}>
      <Typography fontWeight={900} fontSize={20} sx={{ color, lineHeight: 1.1 }} noWrap>{value}</Typography>
      <Typography fontSize={11.5} fontWeight={700} noWrap>{label}</Typography>
      {sub && <Typography variant="caption" color="text.secondary" noWrap>{sub}</Typography>}
    </Paper>
  );
}

/** Sparkline nhỏ (SVG) cho dãy số — báo giá theo tuần. */
export function Sparkline({ values, w = 150, h = 28 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return <Box sx={{ flex: 1 }} />;
  const max = Math.max(1, ...values);
  const stepX = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * stepX).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`).join(' ');
  const lastY = h - (values[values.length - 1] / max) * (h - 4) - 2;
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <polyline points={pts} fill="none" stroke="#0d7a6a" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={w} cy={lastY} r={2.5} fill="#0d7a6a" />
      </svg>
    </Box>
  );
}

export function Row({ onClick, primary, secondary, right }: { onClick: () => void; primary: string; secondary?: string; right?: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1, cursor: 'pointer', '&:hover': { boxShadow: 1 } }} onClick={onClick}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontSize={13} fontWeight={600} noWrap>{primary}</Typography>
          {secondary && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{secondary}</Typography>}
        </Box>
        {right}
      </Stack>
    </Paper>
  );
}

/** Nút hành động nhanh trên 1 dòng (chặn nổi bọt để không kích hoạt mở view). */
export function QuickBtn({ title, icon, color, onClick }: { title: string; icon: ReactNode; color?: string; onClick: () => void }) {
  return (
    <Tooltip title={title}>
      <IconButton size="small" sx={{ color }} onClick={(e) => { e.stopPropagation(); onClick(); }}>{icon}</IconButton>
    </Tooltip>
  );
}
