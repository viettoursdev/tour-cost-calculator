import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import { uploadFileToWorker } from '@/lib/aiWorker';
import { openFilePreview } from '@/stores/filePreviewStore';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useCustomerStore } from '@/stores/customerStore';
import { normalizeVN } from '@/lib/search';
import { toast } from '@/stores/toastStore';
import { LEGACY } from '@/theme';
import type { CloudQuoteEntry, Collaborator, Customer, FileAttachment, User } from '@/types';
import { attMeta } from '@/lib/util';

type Props = { open: boolean; onClose: () => void };

export function SaveCloudQuoteModal({ open, onClose }: Props) {
  const users = useAuthStore((s) => s.users);
  const currentUser = useAuthStore((s) => s.currentUser);
  const draftName = useQuoteStore((s) => s.draft.info.name);
  const draftCustomerId = useQuoteStore((s) => s.draft.customerId);
  const draftCustomerName = useQuoteStore((s) => s.draft.customerName);
  const draftCollabs = useQuoteStore((s) => s.draft.pendingCollaborators);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);
  const template = useQuoteStore((s) => s.draft.template);
  const saveCloud = useQuoteStore((s) => s.saveCloud);
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const dmcQuotes = useQuoteHistoryStore((s) => s.dmcQuotes);
  const customers = useCustomerStore((s) => s.customers);
  const saveCustomer = useCustomerStore((s) => s.save);

  // Follow the active quote template: DMC breakdowns live in a separate history
  // list, so look up the existing entry in the matching source — otherwise a DMC
  // update is wrongly treated as a brand-new quote.
  const sourceQuotes = template === 'dmc' ? dmcQuotes : quotes;
  const existingEntry = useMemo(
    () => (currentQuoteId ? sourceQuotes.find((q) => q.cloudId === currentQuoteId) : undefined),
    [currentQuoteId, sourceQuotes],
  );

  // Pre-load existing customer if the cloud entry has one
  const existingCustomer = useMemo(() => {
    if (!existingEntry?.customerId) return null;
    return customers.find((c) => c.id === existingEntry.customerId) ?? null;
  }, [existingEntry, customers]);

  const [name, setName] = useState(draftName || '');
  const [collabUsers, setCollabUsers] = useState<User[]>(() => {
    if (!existingEntry) return [];
    const set = new Set((existingEntry.collaborators ?? []).map((c) => c.u));
    return users.filter((u) => set.has(u.u));
  });
  const [customer, setCustomer] = useState<Customer | null>(existingCustomer);
  const [customerInput, setCustomerInput] = useState<string>(existingCustomer?.name ?? '');

  // Mỗi lần mở hộp thoại: đồng bộ tên + khách hàng + cộng tác viên. Báo giá đã lưu
  // lấy theo bản ghi cloud; báo giá MỚI lấy theo metadata nhập lúc tạo (NewQuoteDialog).
  useEffect(() => {
    if (!open) return;
    setName(draftName || '');
    if (existingCustomer) {
      setCustomer(existingCustomer); setCustomerInput(existingCustomer.name);
    } else if (draftCustomerId) {
      const c = customers.find((x) => x.id === draftCustomerId) ?? null;
      setCustomer(c); setCustomerInput(c?.name ?? draftCustomerName ?? '');
    } else if (draftCustomerName) {
      setCustomer(null); setCustomerInput(draftCustomerName);
    }
    const collabSource = existingEntry?.collaborators ?? draftCollabs ?? [];
    const set = new Set(collabSource.map((c) => c.u));
    setCollabUsers(users.filter((u) => set.has(u.u)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>(
    () => existingEntry?.attachments ?? (existingEntry?.attachment ? [existingEntry.attachment] : []),
  );
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Lưu cả hai cùng lúc" — chỉ với DMC breakdown: chọn báo giá nước ngoài (intl)
  // để gắn liên kết chéo; một lần lưu sẽ cập nhật cả hai bản ghi.
  const foreignQuotes = useMemo(() => quotes.filter((q) => q.template === 'intl'), [quotes]);
  const [linkedForeign, setLinkedForeign] = useState<CloudQuoteEntry | null>(
    () => (existingEntry?.linkedQuoteId
      ? quotes.find((q) => q.cloudId === existingEntry.linkedQuoteId) ?? null
      : null),
  );

  // Ghi đè lên báo giá có sẵn: chọn 1 báo giá đã lưu để lưu chồng lên (dồn thành
  // phiên bản mới, tối đa 20 bản) thay vì tạo báo giá mới. Bỏ chính báo giá đang
  // mở khỏi danh sách để tránh nhầm với nút "Cập nhật".
  const overwriteOptions = useMemo(
    () => sourceQuotes.filter((q) => q.cloudId !== currentQuoteId),
    [sourceQuotes, currentQuoteId],
  );
  const [overwriteTarget, setOverwriteTarget] = useState<CloudQuoteEntry | null>(null);

  const onPickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      const at = new Date().toISOString();
      const by = currentUser?.name ?? '';
      const uploaded = (await Promise.all(files.map((f) => uploadFileToWorker(f))))
        .map((u) => ({ ...u, uploadedBy: by, uploadedAt: at }));
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError('Tải file lỗi: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
    }
  };

  const otherUsers = useMemo(
    () => users.filter((u) => u.u !== currentUser?.u),
    [users, currentUser?.u],
  );

  const confirmSave = async () => {
    // Đích ghi đè: ưu tiên báo giá người dùng chọn ở ô "Ghi đè".
    let overwrite: { cloudId: string; id: number } | null = overwriteTarget
      ? { cloudId: overwriteTarget.cloudId, id: overwriteTarget.id }
      : null;
    // Tự nhận trùng tên khi tạo báo giá MỚI: mặc định LƯU CHỒNG thành phiên bản
    // mới của bản trùng (không tạo báo giá mới). Người dùng vẫn có thể chọn tạo
    // mới riêng. Bản đã mở (currentQuoteId) thì cập nhật bình thường.
    if (!currentQuoteId && !overwrite) {
      const norm = normalizeVN(name);
      const dup = sourceQuotes.find((q) => normalizeVN(q.name) === norm);
      if (dup) {
        const merge = window.confirm(
          `⚠ Đã có báo giá trùng tên "${dup.name}"${dup.quoteCode ? ` (${dup.quoteCode})` : ''}.\n\n` +
          'OK = Lưu chồng thành phiên bản mới của báo giá này (không tạo báo giá mới, giữ tối đa 20 bản).\n' +
          'Huỷ = Vẫn tạo báo giá mới riêng.',
        );
        if (merge) overwrite = { cloudId: dup.cloudId, id: dup.id };
      }
    }
    setBusy(true);
    setError(null);
    try {
      const collaborators: Collaborator[] = collabUsers.map((u) => ({ u: u.u, name: u.name }));
      const linked = template === 'dmc' && linkedForeign
        ? { id: linkedForeign.cloudId, name: linkedForeign.name, template: linkedForeign.template }
        : null;

      // Khách hàng (optional): cho phép nhập tên chưa có trong danh sách.
      // - Đã chọn từ danh sách → dùng luôn.
      // - Gõ tên trùng (không phân biệt hoa/thường) → khớp khách hiện có.
      // - Tên mới → TỰ TẠO & lưu vào danh sách khách hàng rồi gắn vào báo giá.
      let custArg: { id: string; name: string } | undefined;
      const typed = customerInput.trim();
      if (customer) {
        custArg = { id: customer.id, name: customer.name };
      } else if (typed) {
        const found = customers.find((c) => c.name.trim().toLowerCase() === typed.toLowerCase());
        if (found) {
          custArg = { id: found.id, name: found.name };
        } else {
          const newCust: Customer = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: typed,
            type: 'company',
            contacts: [],
            note: 'Tự tạo khi lưu báo giá',
            createdAt: '',
            createdBy: '',
          };
          await saveCustomer(newCust);
          custArg = { id: newCust.id, name: typed };
        }
      }

      await saveCloud(name, collaborators, note, custArg, attachments, linked, overwrite);
      onClose();
      toast(
        overwrite
          ? `☁️ Đã lưu chồng "${name.trim() || 'báo giá'}" thành phiên bản mới.`
          : `☁️ Đã lưu "${name.trim() || 'báo giá'}" lên cloud.`,
      );
    } catch (e) {
      setError((e as Error).message || 'Lỗi không xác định');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {currentQuoteId ? 'Cập nhật báo giá lên cloud' : 'Lưu báo giá lên cloud'}
        <Typography variant="caption" display="block" color="text.secondary">
          Lưu trữ cloud · đồng bộ toàn bộ tài khoản
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Tên báo giá"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Đà Lạt 3N2Đ – 40pax"
            autoFocus
          />

          {/* Customer link — freeSolo: cho nhập khách chưa có trong danh sách,
              hệ thống sẽ tự tạo & lưu khi bấm Lưu. */}
          <Autocomplete
            freeSolo
            options={customers}
            value={customer}
            inputValue={customerInput}
            onInputChange={(_, v) => setCustomerInput(v)}
            onChange={(_, v) => {
              if (v && typeof v !== 'string') { setCustomer(v); setCustomerInput(v.name); }
              else { setCustomer(null); if (typeof v === 'string') setCustomerInput(v); }
            }}
            getOptionLabel={(c) => (typeof c === 'string' ? c : c.name)}
            isOptionEqualToValue={(a, b) => typeof a !== 'string' && typeof b !== 'string' && a.id === b.id}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Khách hàng (optional)"
                placeholder="Chọn hoặc gõ tên khách mới (tự lưu)"
                helperText="Gõ tên khách chưa có trong danh sách → hệ thống tự thêm vào danh sách khách hàng."
              />
            )}
            renderOption={(props, c) => (
              <li {...props} key={typeof c === 'string' ? c : c.id}>
                <Stack>
                  <Typography variant="body2" fontWeight={600}>{typeof c === 'string' ? c : c.name}</Typography>
                  {typeof c !== 'string' && c.contacts?.[0]?.name && (
                    <Typography variant="caption" color="text.secondary">
                      {c.contacts[0].name}{c.contacts[0].phone ? ` · ${c.contacts[0].phone}` : ''}
                    </Typography>
                  )}
                </Stack>
              </li>
            )}
          />

          {/* Collaborators */}
          <Autocomplete
            multiple
            options={otherUsers}
            value={collabUsers}
            onChange={(_, v) => setCollabUsers(v)}
            getOptionLabel={(u) => `${u.name} (${u.role})`}
            isOptionEqualToValue={(a, b) => a.u === b.u}
            renderTags={(value, getTagProps) =>
              value.map((u, idx) => {
                const { key, ...tagProps } = getTagProps({ index: idx });
                return <Chip key={key} {...tagProps} label={`${u.name} (${u.role})`} />;
              })
            }
            renderInput={(params) => (
              <TextField {...params} label="Cộng tác viên" placeholder="Chọn người được xem báo giá này" />
            )}
          />

          {/* Ghi đè lên báo giá có sẵn (optional) — chỉ khi đang tạo báo giá mới */}
          {!currentQuoteId && overwriteOptions.length > 0 && (
            <Autocomplete
              options={overwriteOptions}
              value={overwriteTarget}
              onChange={(_, v) => setOverwriteTarget(v)}
              getOptionLabel={(q) => `${q.quoteCode ? q.quoteCode + ' · ' : ''}${q.name}`}
              isOptionEqualToValue={(a, b) => a.cloudId === b.cloudId}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="♻️ Ghi đè lên báo giá có sẵn (optional)"
                  placeholder="Chọn báo giá để lưu chồng (không tạo báo giá mới)"
                  helperText="Lưu chồng = thêm 1 phiên bản mới vào báo giá đã chọn (giữ tối đa 20 bản gần nhất)."
                />
              )}
              renderOption={(props, q) => (
                <li {...props} key={q.cloudId}>
                  <Stack>
                    <Typography variant="body2" fontWeight={600}>{q.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {q.quoteCode || '—'}{q.customerName ? ` · ${q.customerName}` : ''}
                    </Typography>
                  </Stack>
                </li>
              )}
            />
          )}

          {overwriteTarget && (
            <Alert severity="warning">
              Sẽ lưu chồng lên <strong>{overwriteTarget.name}</strong>
              {overwriteTarget.quoteCode ? ` (${overwriteTarget.quoteCode})` : ''} — tạo phiên bản mới, không tạo báo giá mới.
            </Alert>
          )}

          {/* DMC breakdown ↔ báo giá nước ngoài: lưu cả hai cùng lúc */}
          {template === 'dmc' && (
            <Autocomplete
              options={foreignQuotes}
              value={linkedForeign}
              onChange={(_, v) => setLinkedForeign(v)}
              getOptionLabel={(q) => `${q.quoteCode ? q.quoteCode + ' · ' : ''}${q.name}`}
              isOptionEqualToValue={(a, b) => a.cloudId === b.cloudId}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="🔗 Lưu kèm báo giá nước ngoài (optional)"
                  placeholder="Chọn báo giá nước ngoài để liên kết"
                  helperText="Một lần lưu sẽ cập nhật liên kết cho cả DMC breakdown và báo giá nước ngoài."
                />
              )}
              renderOption={(props, q) => (
                <li {...props} key={q.cloudId}>
                  <Stack>
                    <Typography variant="body2" fontWeight={600}>{q.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {q.quoteCode || '—'}{q.customerName ? ` · ${q.customerName}` : ''}
                    </Typography>
                  </Stack>
                </li>
              )}
            />
          )}

          <TextField
            label="Ghi chú phiên bản (optional)"
            multiline
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="VD: Đã cập nhật giá khách sạn 4*"
          />

          {/* File đính kèm (nhiều file/báo giá) — dòng cuối sau ghi chú */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              File đính kèm (nhiều file, optional)
            </Typography>
            <Stack spacing={0.75}>
              {attachments.map((att, i) => (
                <Stack key={att.key} direction="row" alignItems="center" spacing={1}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Box
                      component="button" type="button" onClick={() => openFilePreview({ key: att.key, name: att.name })}
                      title={att.name}
                      sx={{
                        display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', p: 0,
                        fontSize: 13, fontWeight: 600, color: LEGACY.teal, fontFamily: 'inherit',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      📎 {att.name}
                    </Box>
                    {attMeta(att) && (
                      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.3 }}>
                        {attMeta(att)}
                      </Typography>
                    )}
                  </Box>
                  <Button
                    size="small" color="error" disabled={busy}
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  >
                    Gỡ
                  </Button>
                </Stack>
              ))}
              <Box>
                <Button
                  component="label" variant="outlined" size="small" startIcon={<span>📎</span>}
                  disabled={uploading || busy}
                >
                  {uploading
                    ? 'Đang tải lên…'
                    : attachments.length
                      ? 'Thêm file'
                      : 'Đính kèm file (PDF/Word/Excel/ảnh…)'}
                  <Box
                    component="input" type="file" hidden multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*"
                    onChange={onPickFiles}
                  />
                </Button>
              </Box>
            </Stack>
          </Box>

          {existingEntry && (
            <Alert severity="info">
              Đây là bản cập nhật của <strong>{existingEntry.quoteCode}</strong>; sẽ tạo phiên bản mới.
            </Alert>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button
          variant="contained"
          disabled={!name.trim() || busy || uploading}
          onClick={confirmSave}
        >
          {busy ? 'Đang lưu…' : overwriteTarget ? 'Ghi đè' : currentQuoteId ? 'Cập nhật' : 'Lưu mới'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
