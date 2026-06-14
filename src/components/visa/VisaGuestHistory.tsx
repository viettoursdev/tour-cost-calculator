import { useEffect, useMemo, useState } from 'react';
import {
  Box, Chip, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import LaunchIcon from '@mui/icons-material/Launch';
import { useQuoteStore } from '@/stores/quoteStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { APPLICANT_RESULT_META, VISA_STATUS_META } from './constants';
import { guestKeyOf, matchesGuestQuery, sameGuest, type GuestKey } from './applicantMatch';
import type { VisaApplicant, VisaProjectDoc } from '@/types';

type Props = {
  /** Khi mở từ 1 khách cụ thể: tự lọc theo khách đó. */
  seed?: GuestKey | null;
};

type Hit = { project: VisaProjectDoc; applicant: VisaApplicant };

function fmtDt(s?: string): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return s; }
}

/** Tra cứu lịch sử visa của một khách xuyên các dự án (khớp tên/HC/ngày sinh). */
export function VisaGuestHistory({ seed = null }: Props) {
  const projects = useVisaProjectStore((s) => s.projects);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const [search, setSearch] = useState(seed?.passport || seed?.name || '');

  useEffect(() => { if (seed) setSearch(seed.passport || seed.name || ''); }, [seed]);

  const hits = useMemo<Hit[]>(() => {
    const q = search.trim();
    if (!seed && !q) return [];
    const out: Hit[] = [];
    for (const project of projects) {
      for (const applicant of project.applicants ?? []) {
        const key = guestKeyOf(applicant);
        const ok = seed
          ? sameGuest(key, seed) || (!!q && matchesGuestQuery(key, q))
          : matchesGuestQuery(key, q);
        if (ok) out.push({ project, applicant });
      }
    }
    return out;
  }, [projects, search, seed]);

  // Gom theo dự án để hiển thị gọn.
  const byProject = useMemo(() => {
    const m = new Map<string, Hit[]>();
    for (const h of hits) {
      const arr = m.get(h.project.id) ?? [];
      arr.push(h);
      m.set(h.project.id, arr);
    }
    return [...m.values()];
  }, [hits]);

  const openLinkedQuote = async (cloudId: string) => {
    if (!window.confirm('Rời phần visa để mở báo giá liên kết? Thay đổi chưa lưu có thể mất.')) return;
    const r = await loadCloud(cloudId);
    if (!r.ok) window.alert('⚠ ' + r.error);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <TextField
        fullWidth size="small" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Nhập họ tên hoặc số hộ chiếu của khách…"
        sx={{ mb: 1 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Khớp theo số hộ chiếu, hoặc họ tên (không dấu) + ngày sinh — liệt kê mọi dự án visa
        khách từng tham gia và báo giá tour liên quan.
      </Typography>

      {(!seed && !search.trim()) ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
          Nhập tên hoặc số hộ chiếu để tra lịch sử visa của khách.
        </Paper>
      ) : byProject.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
          Không tìm thấy khách khớp trong các dự án visa.
        </Paper>
      ) : (
        <Stack spacing={1.25}>
          <Typography variant="caption" color="text.secondary">
            {byProject.length} dự án · {hits.length} lượt khách khớp
          </Typography>
          {byProject.map((group) => {
            const p = group[0].project;
            const meta = VISA_STATUS_META[p.status] ?? VISA_STATUS_META.planning;
            return (
              <Paper key={p.id} variant="outlined" sx={{ p: 1.75, borderLeft: `4px solid ${meta.color}` }}>
                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 0.75 }}>
                  <Typography fontWeight={800} fontSize={15}>{p.name || '(Chưa đặt tên)'}</Typography>
                  <Chip size="small" label={meta.label} sx={{ bgcolor: meta.color + '22', color: meta.color, fontWeight: 700 }} />
                  {p.country && <Chip size="small" variant="outlined" label={`🌐 ${p.country}`} />}
                  <Typography variant="caption" color="text.secondary">{p.code} · {fmtDt(p.updatedAt ?? p.createdAt)}</Typography>
                  <Box sx={{ flex: 1 }} />
                  {p.linkedQuoteId && (
                    <Tooltip title={`Mở báo giá: ${p.linkedQuoteName}`}>
                      <Chip size="small" color="primary" variant="outlined" clickable icon={<LaunchIcon />}
                        label="🔗 Báo giá tour" onClick={() => void openLinkedQuote(p.linkedQuoteId!)} />
                    </Tooltip>
                  )}
                </Stack>
                <Stack spacing={0.5}>
                  {group.map(({ applicant: a }) => {
                    const rm = APPLICANT_RESULT_META[a.result];
                    return (
                      <Stack key={a.id} direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap
                        sx={{ pl: 1, py: 0.25 }}>
                        <Typography fontSize={14} fontWeight={600}>{a.name || '(Chưa nhập tên)'}</Typography>
                        {a.passport && <Chip size="small" variant="outlined" label={`🛂 ${a.passport}`} />}
                        {a.dob && <Typography variant="caption" color="text.secondary">🎂 {fmtDt(a.dob)}</Typography>}
                        <Chip size="small" label={rm.label} sx={{ bgcolor: rm.color + '22', color: rm.color, fontWeight: 700 }} />
                        {a.countriesVisited && (
                          <Typography variant="caption" color="text.secondary">✈️ {a.countriesVisited}</Typography>
                        )}
                      </Stack>
                    );
                  })}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
