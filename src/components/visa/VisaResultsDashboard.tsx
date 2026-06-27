import { useMemo, useState, type ReactNode } from 'react';
import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle, IconButton, MenuItem,
  Paper, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LaunchIcon from '@mui/icons-material/Launch';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useAuthStore } from '@/stores/authStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { APPLICANT_RESULT_META } from './constants';
import { visibleVisaProjects } from './visaAccess';
import { VisaAdvancedStats } from './VisaAdvancedStats';
import { VisaRiskPanel } from './VisaRiskPanel';
import { matchesGuestQuery } from './applicantMatch';
import { normalizeVN } from '@/lib/search';
import type { VisaApplicant, VisaProjectDoc } from '@/types';

type Props = { onOpenProject: (projectId: string) => void };

type ResultKey = 'passed' | 'failed' | 'have_visa' | 'pending';
const RESULT_KEYS: ResultKey[] = ['passed', 'failed', 'have_visa', 'pending'];

type Rec = {
  project: VisaProjectDoc;
  applicant: VisaApplicant;
  country: string;
  departure: string | null;  // ISO date hoặc null
  year: number | null;
  month: number | null;      // 1–12
};

type Tally = { total: number; passed: number; failed: number; have_visa: number; pending: number };
const emptyTally = (): Tally => ({ total: 0, passed: 0, failed: 0, have_visa: 0, pending: 0 });
function addTo(t: Tally, r: ResultKey) { t.total += 1; t[r] += 1; }
const passRate = (t: Tally) => (t.passed + t.failed > 0 ? Math.round((t.passed / (t.passed + t.failed)) * 100) : null);

/** Lấy ngày khởi hành: ưu tiên field departureDate; fallback mốc "Khởi hành". */
function resolveDeparture(p: VisaProjectDoc): string | null {
  if (p.departureDate) return p.departureDate;
  const m = (p.milestones ?? []).find((x) => normalizeVN(x.label).includes('khoi hanh') && x.date);
  return m?.date ?? null;
}

const MONTHS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];

/** Thanh xếp chồng kết quả (đậu/rớt/đã có visa/chờ). */
function StatBar({ t }: { t: Tally }) {
  if (t.total === 0) return <Box sx={{ height: 10, borderRadius: 5, bgcolor: 'rgba(0,0,0,0.06)' }} />;
  const seg = (n: number, color: string) => n > 0
    ? <Box sx={{ width: `${(n / t.total) * 100}%`, bgcolor: color }} /> : null;
  return (
    <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: 'rgba(0,0,0,0.06)' }}>
      {seg(t.passed, APPLICANT_RESULT_META.passed.color)}
      {seg(t.have_visa, APPLICANT_RESULT_META.have_visa.color)}
      {seg(t.failed, APPLICANT_RESULT_META.failed.color)}
      {seg(t.pending, APPLICANT_RESULT_META.pending.color)}
    </Box>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.75, flex: '1 1 140px', minWidth: 130, borderTop: `3px solid ${color}` }}>
      <Typography variant="caption" color="text.secondary" fontWeight={700}>{label}</Typography>
      <Typography fontWeight={900} fontSize={26} sx={{ color, lineHeight: 1.1 }}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Paper>
  );
}

export function VisaResultsDashboard({ onOpenProject }: Props) {
  const allProjects = useVisaProjectStore((s) => s.projects);
  const user = useAuthStore((s) => s.currentUser);

  // Bộ lọc.
  const [year, setYear] = useState<number | ''>('');
  const [month, setMonth] = useState<number | ''>('');
  const [country, setCountry] = useState('');
  const [results, setResults] = useState<Set<ResultKey>>(() => new Set(RESULT_KEYS));
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Rec | null>(null);

  // Flatten tất cả khách của các dự án trong quyền xem.
  const allRecs = useMemo<Rec[]>(() => {
    const out: Rec[] = [];
    for (const project of visibleVisaProjects(user, allProjects)) {
      const departure = resolveDeparture(project);
      const d = departure ? new Date(departure) : null;
      const valid = d && !Number.isNaN(d.getTime());
      for (const applicant of project.applicants ?? []) {
        out.push({
          project, applicant,
          country: project.country || '(Chưa rõ)',
          departure,
          year: valid ? d!.getFullYear() : null,
          month: valid ? d!.getMonth() + 1 : null,
        });
      }
    }
    return out;
  }, [allProjects, user]);

  const years = useMemo(
    () => [...new Set(allRecs.map((r) => r.year).filter((y): y is number => y != null))].sort((a, b) => b - a),
    [allRecs],
  );
  const countries = useMemo(
    () => [...new Set(allRecs.map((r) => r.country))].sort((a, b) => a.localeCompare(b, 'vi')),
    [allRecs],
  );

  const recs = useMemo(() => allRecs.filter((r) => {
    if (year !== '' && r.year !== year) return false;
    if (month !== '' && r.month !== month) return false;
    if (country && r.country !== country) return false;
    if (!results.has(r.applicant.result as ResultKey)) return false;
    if (search.trim() && !matchesGuestQuery(r.applicant, search)) return false;
    return true;
  }), [allRecs, year, month, country, results, search]);

  const total = useMemo(() => { const t = emptyTally(); recs.forEach((r) => addTo(t, r.applicant.result as ResultKey)); return t; }, [recs]);

  const byCountry = useMemo(() => {
    const m = new Map<string, Tally>();
    recs.forEach((r) => { const t = m.get(r.country) ?? emptyTally(); addTo(t, r.applicant.result as ResultKey); m.set(r.country, t); });
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [recs]);

  const byMonth = useMemo(() => {
    // Nếu chọn 1 năm: gom theo 12 tháng. Nếu không: gom theo "YYYY-MM".
    const m = new Map<string, Tally>();
    recs.forEach((r) => {
      if (r.year == null || r.month == null) return;
      const key = year !== '' ? String(r.month) : `${r.year}-${String(r.month).padStart(2, '0')}`;
      const t = m.get(key) ?? emptyTally(); addTo(t, r.applicant.result as ResultKey); m.set(key, t);
    });
    const entries = [...m.entries()];
    if (year !== '') entries.sort((a, b) => Number(a[0]) - Number(b[0]));
    else entries.sort((a, b) => a[0].localeCompare(b[0]));
    return entries;
  }, [recs, year]);

  const failed = useMemo(() => recs.filter((r) => r.applicant.result === 'failed'), [recs]);
  const maxMonthTotal = Math.max(1, ...byMonth.map(([, t]) => t.total));

  const toggleResult = (k: ResultKey) =>
    setResults((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n.size ? n : new Set(RESULT_KEYS); });
  const resetFilters = () => { setYear(''); setMonth(''); setCountry(''); setResults(new Set(RESULT_KEYS)); setSearch(''); };

  const monthLabel = (key: string) => (year !== '' ? MONTHS[Number(key) - 1] : key);

  return (
    <Box sx={{ p: 3, maxWidth: 1150, mx: 'auto' }}>
      {/* #E — Radar rủi ro visa (dự báo từ lịch sử) */}
      <VisaRiskPanel onOpenProject={onOpenProject} />

      {/* Bộ lọc */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap alignItems="center">
          <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase' }}>Bộ lọc</Typography>
          <Select size="small" displayEmpty value={year} onChange={(e) => setYear(e.target.value === '' ? '' : Number(e.target.value))} sx={{ minWidth: 110 }}>
            <MenuItem value="">Mọi năm</MenuItem>
            {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </Select>
          <Select size="small" displayEmpty value={month} onChange={(e) => setMonth(e.target.value === '' ? '' : Number(e.target.value))} sx={{ minWidth: 110 }}>
            <MenuItem value="">Mọi tháng</MenuItem>
            {MONTHS.map((m, i) => <MenuItem key={m} value={i + 1}>{`Tháng ${i + 1}`}</MenuItem>)}
          </Select>
          <Select size="small" displayEmpty value={country} onChange={(e) => setCountry(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">Mọi quốc gia</MenuItem>
            {countries.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </Select>
          <Stack direction="row" spacing={0.5}>
            {RESULT_KEYS.map((k) => (
              <Chip
                key={k} size="small" label={APPLICANT_RESULT_META[k].label}
                variant={results.has(k) ? 'filled' : 'outlined'}
                onClick={() => toggleResult(k)}
                sx={{ fontWeight: 700, bgcolor: results.has(k) ? APPLICANT_RESULT_META[k].color + '22' : undefined, color: APPLICANT_RESULT_META[k].color, borderColor: APPLICANT_RESULT_META[k].color }}
              />
            ))}
          </Stack>
          <TextField size="small" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Tên / hộ chiếu" sx={{ minWidth: 160, flex: 1 }} />
          <Button size="small" startIcon={<RestartAltIcon />} onClick={resetFilters}>Xóa lọc</Button>
        </Stack>
      </Paper>

      {/* KPI */}
      <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Kpi label="Tổng khách" value={total.total} color="#0f3a4a" />
        <Kpi label="Đậu" value={total.passed} color={APPLICANT_RESULT_META.passed.color} />
        <Kpi label="Rớt" value={total.failed} color={APPLICANT_RESULT_META.failed.color} />
        <Kpi label="Đã có visa" value={total.have_visa} color={APPLICANT_RESULT_META.have_visa.color} />
        <Kpi label="Chờ kết quả" value={total.pending} color={APPLICANT_RESULT_META.pending.color} />
        <Kpi label="Tỉ lệ đậu" value={passRate(total) == null ? '–' : `${passRate(total)}%`} sub="trên số đã có kết quả"
          color={(passRate(total) ?? 0) >= 50 ? '#27ae60' : '#dc3250'} />
      </Stack>

      {recs.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', color: 'text.disabled' }}>
          Không có dữ liệu khớp bộ lọc.
        </Paper>
      ) : (
        <Stack spacing={2}>
          <VisaAdvancedStats />
          {/* Theo quốc gia */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={800} sx={{ mb: 1.5 }}>📊 Kết quả theo quốc gia</Typography>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 800, color: 'text.secondary' } }}>
                  <TableCell>Quốc gia</TableCell>
                  <TableCell sx={{ width: '40%' }}>Phân bố</TableCell>
                  <TableCell align="right">Khách</TableCell>
                  <TableCell align="right">Đậu</TableCell>
                  <TableCell align="right">Rớt</TableCell>
                  <TableCell align="right">Tỉ lệ đậu</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {byCountry.map(([c, t]) => (
                  <TableRow key={c} hover>
                    <TableCell sx={{ fontWeight: 700 }}>{c}</TableCell>
                    <TableCell><StatBar t={t} /></TableCell>
                    <TableCell align="right">{t.total}</TableCell>
                    <TableCell align="right" sx={{ color: APPLICANT_RESULT_META.passed.color, fontWeight: 700 }}>{t.passed}</TableCell>
                    <TableCell align="right" sx={{ color: APPLICANT_RESULT_META.failed.color, fontWeight: 700 }}>{t.failed}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: (passRate(t) ?? 0) >= 50 ? '#27ae60' : '#dc3250' }}>
                      {passRate(t) == null ? '–' : `${passRate(t)}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          {/* Theo tháng */}
          {byMonth.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography fontWeight={800} sx={{ mb: 1.5 }}>
                🗓️ Kết quả theo {year !== '' ? `tháng (năm ${year})` : 'kỳ (năm-tháng)'}
              </Typography>
              <Stack spacing={1}>
                {byMonth.map(([key, t]) => (
                  <Stack key={key} direction="row" alignItems="center" spacing={1.5}>
                    <Typography variant="caption" sx={{ width: 64, fontWeight: 700 }}>{monthLabel(key)}</Typography>
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ width: `${(t.total / maxMonthTotal) * 100}%`, minWidth: 4 }}>
                        <StatBar t={t} />
                      </Box>
                    </Box>
                    <Typography variant="caption" sx={{ width: 150, textAlign: 'right', color: 'text.secondary' }}>
                      {t.total} khách · <b style={{ color: APPLICANT_RESULT_META.passed.color }}>{t.passed}↑</b> <b style={{ color: APPLICANT_RESULT_META.failed.color }}>{t.failed}↓</b>
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          )}

          {/* Khách rớt */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={800} sx={{ mb: 1.5 }}>
              ❌ Khách rớt ({failed.length}) — bấm để xem lý do
            </Typography>
            {failed.length === 0 ? (
              <Typography variant="body2" color="text.disabled">Không có khách rớt trong phạm vi lọc.</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 800, color: 'text.secondary' } }}>
                    <TableCell>Khách</TableCell>
                    <TableCell>Hộ chiếu</TableCell>
                    <TableCell>Quốc gia</TableCell>
                    <TableCell>Đoàn</TableCell>
                    <TableCell>Lý do rớt</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {failed.map((r) => (
                    <TableRow key={r.project.id + r.applicant.id} hover sx={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>
                      <TableCell sx={{ fontWeight: 700 }}>{r.applicant.name || '(Chưa nhập tên)'}</TableCell>
                      <TableCell>{r.applicant.passport || '—'}</TableCell>
                      <TableCell>{r.country}</TableCell>
                      <TableCell>{r.project.name || r.project.code}</TableCell>
                      <TableCell sx={{ color: r.applicant.failReason ? 'text.primary' : 'text.disabled', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.applicant.failReason || '(chưa ghi lý do)'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Stack>
      )}

      {/* Drill-down: chi tiết khách (chỉ đọc) */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} fullWidth maxWidth="sm">
        {detail && (
          <>
            <DialogTitle sx={{ pr: 6 }}>
              🧑‍✈️ {detail.applicant.name || '(Chưa nhập tên)'}
              <IconButton onClick={() => setDetail(null)} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={1}>
                <Row k="Kết quả" v={
                  <Chip size="small" label={APPLICANT_RESULT_META[detail.applicant.result].label}
                    sx={{ bgcolor: APPLICANT_RESULT_META[detail.applicant.result].color + '22', color: APPLICANT_RESULT_META[detail.applicant.result].color, fontWeight: 700 }} />
                } />
                {detail.applicant.result === 'failed' && (
                  <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: 'rgba(220,50,80,0.08)', border: '1px solid rgba(220,50,80,0.3)' }}>
                    <Typography variant="caption" fontWeight={800} color="error">Lý do rớt</Typography>
                    <Typography variant="body2">{detail.applicant.failReason || '(chưa ghi lý do)'}</Typography>
                  </Box>
                )}
                <Row k="Giới tính" v={detail.applicant.gender || '—'} />
                <Row k="Ngày sinh" v={detail.applicant.dob || '—'} />
                <Row k="Hộ chiếu" v={detail.applicant.passport || '—'} />
                <Row k="Quốc gia đã đi" v={detail.applicant.countriesVisited || '—'} />
                <Row k="Quốc gia xin visa" v={detail.country} />
                <Row k="Đoàn" v={`${detail.project.name || ''} (${detail.project.code})`} />
                <Row k="Ngày khởi hành" v={detail.departure || '—'} />
                {detail.applicant.note && <Row k="Lưu ý" v={detail.applicant.note} />}
              </Stack>
            </DialogContent>
            <Stack direction="row" justifyContent="flex-end" sx={{ p: 1.5 }}>
              <Tooltip title="Mở dự án chứa khách này">
                <Button variant="contained" startIcon={<LaunchIcon />}
                  onClick={() => { const id = detail.project.id; setDetail(null); onOpenProject(id); }}
                  sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
                  Mở dự án
                </Button>
              </Tooltip>
            </Stack>
          </>
        )}
      </Dialog>
    </Box>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <Stack direction="row" spacing={1}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140, fontWeight: 600 }}>{k}</Typography>
      <Typography variant="body2" sx={{ flex: 1 }}>{v}</Typography>
    </Stack>
  );
}
