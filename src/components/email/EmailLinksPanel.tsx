import { useEffect, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import SendIcon from '@mui/icons-material/Send';
import CallMadeIcon from '@mui/icons-material/CallMade';
import { useEmailStore } from '@/stores/emailStore';
import { emailProvider, isMockEmail } from '@/lib/email/provider';
import { SendEmailDialog, type SendEmailDefaults } from './SendEmailDialog';
import { LEGACY } from '@/theme';
import type { EmailLinkTarget, EmailMessage } from '@/types';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });

/** Nút kết nối / trạng thái tài khoản Outlook (mock ở giai đoạn dựng khung). */
export function ConnectOutlookButton() {
  const connected = useEmailStore((s) => s.connected);
  const account = useEmailStore((s) => s.account);
  const connecting = useEmailStore((s) => s.connecting);
  const connect = useEmailStore((s) => s.connect);
  const disconnect = useEmailStore((s) => s.disconnect);
  if (connected && account) {
    return (
      <Tooltip title={`Đã kết nối: ${account.address}${isMockEmail ? ' (thử nghiệm)' : ''} — bấm để ngắt`}>
        <Chip size="small" color="success" variant="outlined" onDelete={() => void disconnect()}
          label={`Outlook: ${account.address}`} />
      </Tooltip>
    );
  }
  return (
    <Button size="small" variant="outlined" startIcon={<MailOutlineIcon />} disabled={connecting}
      onClick={() => void connect()}>
      {connecting ? 'Đang kết nối…' : 'Kết nối Outlook'}
    </Button>
  );
}

/** Khu vực email gắn vào một khách hàng / báo giá. */
export function EmailLinksPanel({ targetType, targetId, targetName, searchHint, composeDefaults }: {
  targetType: EmailLinkTarget; targetId: string; targetName?: string; searchHint?: string;
  /** Có giá trị → hiện nút "Soạn email" gửi thẳng báo giá/hợp đồng (prefill sẵn). */
  composeDefaults?: SendEmailDefaults;
}) {
  const connected = useEmailStore((s) => s.connected);
  const canSend = useEmailStore((s) => s.canSend);
  const links = useEmailStore((s) => s.links);
  const unlink = useEmailStore((s) => s.unlink);
  const [searchOpen, setSearchOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const myLinks = links
    .filter((l) => l.targetType === targetType && l.targetId === targetId)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }} flexWrap="wrap" useFlexGap>
        <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase' }}>
          Email (Outlook){myLinks.length ? ` (${myLinks.length})` : ''}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {connected ? (
          <>
            {composeDefaults && canSend && (
              <Button size="small" variant="outlined" startIcon={<SendIcon />} onClick={() => setComposeOpen(true)}>
                Soạn email
              </Button>
            )}
            <Button size="small" variant="contained" startIcon={<LinkIcon />} onClick={() => setSearchOpen(true)}
              sx={{ background: 'linear-gradient(135deg,#0369a1,#0ea5e9)' }}>Gắn email</Button>
          </>
        ) : <ConnectOutlookButton />}
      </Stack>

      {isMockEmail && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.75 }}>
          ⚙️ Đang dùng dữ liệu thử nghiệm — sẽ thay bằng Outlook thật khi IT cấp App Registration.
        </Typography>
      )}

      {myLinks.length === 0 ? (
        <Typography variant="caption" color="text.disabled">Chưa gắn email nào cho mục này.</Typography>
      ) : (
        <Stack spacing={0.75}>
          {myLinks.map((l) => {
            const isOut = l.direction === 'out';
            return (
            <Paper key={l.id} variant="outlined" sx={{ p: 1, borderLeft: `4px solid ${isOut ? '#16a34a' : '#0ea5e9'}` }}>
              <Stack direction="row" alignItems="flex-start" spacing={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    {isOut && <CallMadeIcon sx={{ fontSize: 14, color: '#16a34a' }} />}
                    <Typography fontSize={13} fontWeight={700} noWrap>{l.subject || '(không tiêu đề)'}</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {isOut
                      ? `Gửi tới ${l.toAddress ?? '—'} · ${fmtDate(l.receivedAt)} · bởi ${l.linkedBy}`
                      : `${l.fromName} <${l.fromAddress}> · ${fmtDate(l.receivedAt)} · gắn bởi ${l.linkedBy}`}
                  </Typography>
                </Box>
                {l.webLink && (
                  <Tooltip title="Mở trong Outlook">
                    <IconButton size="small" component="a" href={l.webLink} target="_blank" rel="noopener" sx={{ color: LEGACY.teal }}><OpenInNewIcon sx={{ fontSize: 16 }} /></IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Gỡ liên kết">
                  <IconButton size="small" color="error" onClick={() => void unlink(l.id)}><LinkOffIcon sx={{ fontSize: 16 }} /></IconButton>
                </Tooltip>
              </Stack>
            </Paper>
            );
          })}
        </Stack>
      )}

      {composeOpen && (
        <SendEmailDialog
          target={{ type: targetType, id: targetId, name: targetName }}
          defaults={composeDefaults}
          onClose={() => setComposeOpen(false)}
        />
      )}

      {searchOpen && (
        <EmailSearchDialog
          targetType={targetType} targetId={targetId} targetName={targetName}
          initialQuery={searchHint ?? ''} onClose={() => setSearchOpen(false)}
        />
      )}
    </Box>
  );
}

function EmailSearchDialog({ targetType, targetId, targetName, initialQuery, onClose }: {
  targetType: EmailLinkTarget; targetId: string; targetName?: string; initialQuery: string; onClose: () => void;
}) {
  const links = useEmailStore((s) => s.links);
  const linkEmail = useEmailStore((s) => s.linkEmail);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<EmailMessage[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (q: string) => {
    setBusy(true);
    try { setResults(await emailProvider.search(q)); }
    finally { setBusy(false); }
  };
  // Tìm sẵn theo gợi ý khi mở.
  useEffect(() => {
    void run(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLinked = (id: string) => links.some((l) => l.emailId === id && l.targetType === targetType && l.targetId === targetId);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Gắn email vào {targetType === 'customer' ? 'khách hàng' : 'báo giá'}{targetName ? ` · ${targetName}` : ''}</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1.5 }}>
          <TextField size="small" fullWidth autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo email khách, tên tour, tiêu đề…"
            onKeyDown={(e) => { if (e.key === 'Enter') void run(query); }} />
          <Button variant="outlined" startIcon={<SearchIcon />} disabled={busy} onClick={() => void run(query)}>Tìm</Button>
        </Stack>
        {busy && results == null ? (
          <Typography variant="caption" color="text.secondary">Đang tìm…</Typography>
        ) : results && results.length === 0 ? (
          <Typography variant="caption" color="text.disabled">Không tìm thấy email phù hợp.</Typography>
        ) : (
          <Stack spacing={0.75}>
            {(results ?? []).map((m) => {
              const linked = isLinked(m.id);
              return (
                <Paper key={m.id} variant="outlined" sx={{ p: 1 }}>
                  <Stack direction="row" alignItems="flex-start" spacing={1}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontSize={13} fontWeight={700} noWrap>{m.subject}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>{m.fromName} &lt;{m.fromAddress}&gt; · {fmtDate(m.receivedAt)}</Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.preview}</Typography>
                    </Box>
                    <Button size="small" variant={linked ? 'text' : 'contained'} disabled={linked}
                      startIcon={<LinkIcon />}
                      onClick={() => void linkEmail(m, { type: targetType, id: targetId, name: targetName })}
                      sx={linked ? undefined : { background: 'linear-gradient(135deg,#0369a1,#0ea5e9)' }}>
                      {linked ? 'Đã gắn' : 'Gắn'}
                    </Button>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
}
