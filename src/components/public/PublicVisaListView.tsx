import { useEffect, useState } from 'react';
import {
  Alert, Box, Chip, CircularProgress, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import { sbGetPublicVisaList } from '@/lib/supabase';
import { VTE_LOGO } from '@/lib/exports/vteLogo';
import type { PublicVisaListDoc } from '@/types';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function PublicVisaListView({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<PublicVisaListDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    setLoading(true);
    sbGetPublicVisaList(token)
      .then((d) => { if (!on) return; if (d) setDoc(d); else setError('Không tìm thấy danh sách. Link có thể chưa được duyệt, đã bị gỡ hoặc hết hạn.'); })
      .catch((e) => { if (on) setError('Không tải được danh sách: ' + (e as Error).message); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [token]);

  if (loading) {
    return <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: '#0d7a6a' }} /></Box>;
  }
  if (error || !doc) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: '#f4f7fb' }}>
        <Alert severity="warning" sx={{ maxWidth: 460 }}>{error ?? 'Không có dữ liệu.'}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#eef3f8', py: { xs: 0, sm: 4 } }}>
      <Box sx={{ maxWidth: 1000, mx: 'auto', bgcolor: '#fff', boxShadow: { sm: '0 12px 40px rgba(15,58,74,0.12)' }, borderRadius: { sm: 3 }, overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 45%,#14a08c)', color: '#fff', px: { xs: 2.5, sm: 4 }, py: 3 }}>
          <Box component="img" src={VTE_LOGO} alt="Viettours" sx={{ height: 34, filter: 'brightness(0) invert(1)', mb: 1.5 }} />
          <Typography sx={{ fontSize: { xs: 20, sm: 24 }, fontWeight: 900, lineHeight: 1.15 }}>{doc.projectName}</Typography>
          <Typography sx={{ opacity: 0.9, mt: 0.5 }}>
            Danh sách & tình trạng xin visa{doc.country ? ` · ${doc.country}` : ''} · {doc.count} khách
          </Typography>
        </Box>

        <Box sx={{ px: { xs: 1.5, sm: 4 }, py: 3 }}>
          {doc.note && <Typography sx={{ mb: 2, whiteSpace: 'pre-wrap', color: 'text.secondary' }}>{doc.note}</Typography>}

          {doc.rows.length === 0 ? (
            <Alert severity="info">Chưa có khách trong danh sách.</Alert>
          ) : (
            <Paper variant="outlined" sx={{ borderRadius: 2, overflowX: 'auto' }}>
              <Table size="small" stickyHeader sx={{ minWidth: Math.max(360, doc.columns.length * 120) }}>
                <TableHead>
                  <TableRow>
                    {doc.columns.map((c) => (
                      <TableCell key={c.key} align={c.align === 'center' ? 'center' : 'left'}
                        sx={{ fontWeight: 800, bgcolor: '#0d7a6a', color: '#fff', whiteSpace: 'nowrap' }}>
                        {c.label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {doc.rows.map((row, ri) => (
                    <TableRow key={ri} sx={{ '&:nth-of-type(even)': { bgcolor: 'rgba(13,122,106,0.04)' } }}>
                      {doc.columns.map((c, ci) => (
                        <TableCell key={c.key} align={c.align === 'center' ? 'center' : 'left'}
                          sx={{ whiteSpace: c.align === 'center' ? 'nowrap' : 'normal' }}>
                          {row[ci] === '' || row[ci] == null ? <Box component="span" sx={{ color: 'text.disabled' }}>—</Box> : String(row[ci])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap alignItems="center">
            <Chip size="small" label={`Cập nhật: ${fmtDate(doc.publishedAt)}`} sx={{ bgcolor: 'rgba(13,122,106,0.08)' }} />
          </Stack>

          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
            Danh sách cung cấp bởi {doc.publishedBy} · Viettours. Mọi thắc mắc xin liên hệ nhân viên phụ trách.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
