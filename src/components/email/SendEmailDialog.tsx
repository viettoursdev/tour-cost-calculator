import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useEmailStore } from '@/stores/emailStore';
import type { EmailLinkTarget, SendAttachment } from '@/types';

/** Tách "a@x.com, b@y.com; c@z.com" thành mảng địa chỉ. */
const parseAddrs = (s: string): string[] =>
  s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export interface SendEmailDefaults {
  to?: string[];
  cc?: string[];
  subject?: string;
  bodyHtml?: string;
  /** Sinh tệp đính kèm (lazy) — vd render PDF báo giá khi bấm Gửi. */
  attachment?: () => Promise<SendAttachment>;
}

/**
 * Hộp thoại soạn & gửi email (báo giá/hợp đồng) qua Outlook/M365.
 * Khi `target` có giá trị, email gửi đi được ghi vào email_links (direction 'out').
 */
export function SendEmailDialog({ target, defaults, onClose }: {
  target?: { type: EmailLinkTarget; id: string; name?: string };
  defaults?: SendEmailDefaults;
  onClose: (sent: boolean) => void;
}) {
  const sending = useEmailStore((s) => s.sending);
  const sendEmail = useEmailStore((s) => s.sendEmail);
  const [to, setTo] = useState((defaults?.to ?? []).join(', '));
  const [cc, setCc] = useState((defaults?.cc ?? []).join(', '));
  const [subject, setSubject] = useState(defaults?.subject ?? '');
  const [body, setBody] = useState(defaults?.bodyHtml ?? '');
  const hasAttachment = !!defaults?.attachment;

  const recipients = parseAddrs(to);
  const ccList = parseAddrs(cc);
  const badAddr = [...recipients, ...ccList].find((a) => !isEmail(a));
  const canSubmit = recipients.length > 0 && !badAddr && subject.trim().length > 0 && !sending;

  const submit = async () => {
    const attachments: SendAttachment[] = [];
    if (defaults?.attachment) {
      try {
        attachments.push(await defaults.attachment());
      } catch (e) {
        window.alert('❌ Tạo tệp đính kèm lỗi: ' + (e as Error).message);
        return;
      }
    }
    const ok = await sendEmail(
      {
        to: recipients,
        cc: ccList.length ? ccList : undefined,
        subject: subject.trim(),
        // Body soạn dạng văn bản thường → bọc HTML, giữ xuống dòng.
        bodyHtml: body.includes('<') ? body : body.replace(/\n/g, '<br/>'),
        attachments: attachments.length ? attachments : undefined,
      },
      target,
    );
    if (ok) onClose(true);
  };

  return (
    <Dialog open onClose={() => onClose(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Gửi email qua Outlook{target?.name ? ` · ${target.name}` : ''}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.25} sx={{ mt: 1 }}>
          <TextField size="small" label="Đến" placeholder="khach@congty.vn, ..." fullWidth
            value={to} onChange={(e) => setTo(e.target.value)}
            error={!!badAddr && recipients.includes(badAddr)} />
          <TextField size="small" label="CC (tuỳ chọn)" placeholder="cc@congty.vn" fullWidth
            value={cc} onChange={(e) => setCc(e.target.value)} />
          <TextField size="small" label="Tiêu đề" fullWidth
            value={subject} onChange={(e) => setSubject(e.target.value)} />
          <TextField size="small" label="Nội dung" fullWidth multiline minRows={6}
            value={body} onChange={(e) => setBody(e.target.value)} />
          {hasAttachment && (
            <Box>
              <Chip size="small" icon={<AttachFileIcon sx={{ fontSize: 16 }} />} variant="outlined"
                label="Đính kèm sẽ được tạo khi gửi" />
            </Box>
          )}
          {badAddr && (
            <Typography variant="caption" color="error">Địa chỉ không hợp lệ: {badAddr}</Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)} disabled={sending}>Huỷ</Button>
        <Button variant="contained" startIcon={<SendIcon />} disabled={!canSubmit}
          onClick={() => void submit()}
          sx={{ background: 'linear-gradient(135deg,#0369a1,#0ea5e9)' }}>
          {sending ? 'Đang gửi…' : 'Gửi'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
