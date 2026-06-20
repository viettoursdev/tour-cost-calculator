import { useEffect, useMemo, useState } from 'react';
import {
  Box, Chip, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import { fbSubscribeAuditLog } from '@/lib/dataBackend';
import { filterRank } from '@/lib/search';
import type { AuditEntry, AuditAction } from '@/types';

const ACTION_META: Record<AuditAction, { label: string; color: string }> = {
  create: { label: 'Tạo mới', color: '#27ae60' },
  update: { label: 'Cập nhật', color: '#2563eb' },
  delete: { label: 'Xoá', color: '#dc3250' },
};

export function AuditView() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<AuditAction | ''>('');
  const [entity, setEntity] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsub = fbSubscribeAuditLog((e) => { setEntries(e); setLoading(false); });
    return () => unsub();
  }, []);

  const entities = useMemo(() => [...new Set(entries.map((e) => e.entity))].sort(), [entries]);
  const rows = useMemo(() => {
    let list = entries;
    if (action) list = list.filter((e) => e.action === action);
    if (entity) list = list.filter((e) => e.entity === entity);
    return filterRank(list, search, (e) => [e.name, e.byName, e.entity, e.note].filter(Boolean).join(' '));
  }, [entries, action, entity, search]);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography fontWeight={900} fontSize={16}>📋 Nhật ký hoạt động hệ thống</Typography>
          <Typography variant="caption" color="text.secondary">{rows.length} / {entries.length} bản ghi · ai tạo/sửa/xoá báo giá, hợp đồng, tỷ giá</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField size="small" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Tìm tên, người, đối tượng…" sx={{ minWidth: 200 }} />
          <Select size="small" displayEmpty value={action} onChange={(e) => setAction(e.target.value as AuditAction | '')} sx={{ minWidth: 120 }}>
            <MenuItem value="">Mọi thao tác</MenuItem>
            {(Object.keys(ACTION_META) as AuditAction[]).map((a) => <MenuItem key={a} value={a}>{ACTION_META[a].label}</MenuItem>)}
          </Select>
          <Select size="small" displayEmpty value={entity} onChange={(e) => setEntity(e.target.value)} sx={{ minWidth: 130 }}>
            <MenuItem value="">Mọi đối tượng</MenuItem>
            {entities.map((en) => <MenuItem key={en} value={en}>{en}</MenuItem>)}
          </Select>
        </Stack>
      </Stack>

      {loading ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>Đang tải nhật ký…</Paper>
      ) : rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>Chưa có hoạt động nào khớp bộ lọc.</Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 720, '& td, & th': { borderColor: 'rgba(0,0,0,0.06)' } }}>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 800, bgcolor: 'rgba(20,150,140,0.06)' } }}>
                <TableCell sx={{ width: 150 }}>Thời gian</TableCell>
                <TableCell sx={{ width: 130 }}>Người thực hiện</TableCell>
                <TableCell sx={{ width: 110 }}>Thao tác</TableCell>
                <TableCell sx={{ width: 130 }}>Đối tượng</TableCell>
                <TableCell>Tên / Ghi chú</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((e) => {
                const m = ACTION_META[e.action];
                return (
                  <TableRow key={e.id} hover>
                    <TableCell><Typography variant="caption">{new Date(e.at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</Typography></TableCell>
                    <TableCell><Typography fontSize={13}>{e.byName}</Typography></TableCell>
                    <TableCell><Chip size="small" label={m.label} sx={{ height: 20, bgcolor: m.color + '22', color: m.color, fontWeight: 700 }} /></TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{e.entity}</Typography></TableCell>
                    <TableCell><Typography fontSize={13} fontWeight={600}>{e.name}{e.note ? <Typography component="span" variant="caption" color="text.secondary"> · {e.note}</Typography> : null}</Typography></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
