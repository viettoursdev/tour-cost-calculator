import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle, FormControlLabel, IconButton,
  MenuItem, Paper, Select, Stack, Switch, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionIcon from '@mui/icons-material/Description';
import HistoryIcon from '@mui/icons-material/History';
import PeopleIcon from '@mui/icons-material/People';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SaveIcon from '@mui/icons-material/Save';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useVisaProcStore } from '@/stores/visaProcStore';
import { useHistoryState } from '@/lib/useHistoryState';
import { useUndoRedoShortcuts } from '@/lib/useUndoRedoShortcuts';
import { UndoRedoButtons } from '@/components/common/UndoRedoButtons';
import { PROC_KIND_ICON, VISAP_TYPES, newProcField, newProcRow, newProcSection } from './constants';
import { exportVisaProcDocx } from '@/lib/exports/exportVisaProcDocx';
import { exportVisaProcPDF } from '@/lib/exports/exportVisaProcPDF';
import { uploadFileToWorker, workerFileUrl } from '@/lib/aiWorker';
import { attMeta } from '@/lib/util';
import { VisaProcCollabModal } from './VisaProcCollabModal';
import type { User, VisaProcDoc, VisaProcSection } from '@/types';

type Props = {
  initial: VisaProcDoc;
  user: User;
  onBack: () => void;
};

export function VisaProcBuilder({ initial, user, onBack }: Props) {
  const { state: doc, set: setDoc, undo, redo, canUndo, canRedo } = useHistoryState<VisaProcDoc>(initial);
  useUndoRedoShortcuts(undo, redo);
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const procList = useVisaProcStore((s) => s.list);
  const [showCollab, setShowCollab] = useState(false);
  const [showVers, setShowVers] = useState(false);
  const [showTpl, setShowTpl] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const isOwner = doc.createdByUsername === user.u;
  const savedBy = `${user.name} (${user.role})`;

  const templates = procList.filter((x) => x.isTemplate && x.id !== doc.id);

  const onPickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      const at = new Date().toISOString();
      const uploaded = (await Promise.all(files.map((f) => uploadFileToWorker(f))))
        .map((u) => ({ ...u, uploadedBy: user.name, uploadedAt: at }));
      setDoc((p) => ({ ...p, attachments: [...(p.attachments ?? []), ...uploaded] }));
    } catch (err) {
      window.alert('Tải file lỗi: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };
  const removeAtt = (i: number) =>
    setDoc((p) => ({ ...p, attachments: (p.attachments ?? []).filter((_, j) => j !== i) }));

  const applyTemplate = async (id: string) => {
    const full = await useVisaProcStore.getState().load(id);
    if (!full) { window.alert('Không tải được template.'); return; }
    if (!window.confirm('Áp dụng template này? Các mục hồ sơ hiện tại sẽ bị thay thế (file & link giữ nguyên).')) return;
    setDoc((p) => ({
      ...p,
      sections: JSON.parse(JSON.stringify(full.sections)) as VisaProcSection[],
      country: p.country || full.country,
      visaType: p.visaType || full.visaType,
    }));
    setShowTpl(false);
  };

  // Auto-save 1.5s debounce.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void useVisaProcStore.getState().save(doc, savedBy).catch(() => { /* swallow */ });
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [doc, savedBy]);

  const set = <K extends keyof VisaProcDoc>(k: K, v: VisaProcDoc[K]) =>
    setDoc((p) => ({ ...p, [k]: v }));

  // ── Section ops ──
  const updSection = (sid: string, fn: (s: VisaProcSection) => VisaProcSection) =>
    setDoc((p) => ({ ...p, sections: p.sections.map((s) => (s.id === sid ? fn(s) : s)) }));
  const addSection = () => setDoc((p) => ({
    ...p,
    sections: [...p.sections, newProcSection('custom', 'Mục mới', ['Trường mới'], false)],
  }));
  const delSection = (sid: string) => setDoc((p) => ({
    ...p,
    sections: p.sections.filter((s) => s.id !== sid),
  }));

  const addField = (sid: string) => updSection(sid, (s) => {
    const f = newProcField('Trường mới');
    return {
      ...s,
      fieldDefs: [...s.fieldDefs, f],
      rows: s.rows.map((r) => ({ ...r, values: { ...r.values, [f.id]: '' } })),
    };
  });
  const updFieldLabel = (sid: string, fid: string, label: string) =>
    updSection(sid, (s) => ({
      ...s,
      fieldDefs: s.fieldDefs.map((f) => (f.id === fid ? { ...f, label } : f)),
    }));
  const delField = (sid: string, fid: string) => updSection(sid, (s) => ({
    ...s,
    fieldDefs: s.fieldDefs.filter((f) => f.id !== fid),
    rows: s.rows.map((r) => {
      const rest = { ...r.values };
      delete rest[fid];
      return { ...r, values: rest };
    }),
  }));

  const addRow = (sid: string) => updSection(sid, (s) => ({
    ...s,
    rows: [...s.rows, newProcRow(s.fieldDefs)],
  }));
  const delRow = (sid: string, rid: string) => updSection(sid, (s) => ({
    ...s,
    rows: s.rows.filter((r) => r.id !== rid),
  }));
  const updCell = (sid: string, rid: string, fid: string, val: string) =>
    updSection(sid, (s) => ({
      ...s,
      rows: s.rows.map((r) => (r.id === rid ? { ...r, values: { ...r.values, [fid]: val } } : r)),
    }));

  const linkQuote = (qId: string) => {
    if (!qId) {
      setDoc((p) => ({ ...p, linkedQuoteId: null, linkedQuoteName: '' }));
      return;
    }
    const q = quotes.find((x) => x.cloudId === qId);
    if (!q) return;
    setDoc((p) => ({
      ...p,
      linkedQuoteId: q.cloudId,
      linkedQuoteName: q.name ?? '',
    }));
  };

  const saveVersion = () => {
    setDoc((p) => {
      const vers = [...(p.versions ?? [])];
      const versionNo = (vers[0]?.versionNo ?? 0) + 1;
      vers.unshift({
        versionNo,
        savedAt: new Date().toISOString(),
        savedBy: user.name,
        sections: JSON.parse(JSON.stringify(p.sections)) as VisaProcSection[],
      });
      return { ...p, versions: vers.slice(0, 10) };
    });
  };

  const restoreVersion = (v: VisaProcDoc['versions'][number]) => {
    if (!window.confirm(`Khôi phục phiên bản v${v.versionNo}? Nội dung hiện tại sẽ bị thay thế (vẫn còn trong lịch sử).`)) return;
    setDoc((p) => ({ ...p, sections: JSON.parse(JSON.stringify(v.sections)) as VisaProcSection[] }));
    setShowVers(false);
  };

  const handleSaveNow = async () => {
    setSaving(true);
    try {
      await useVisaProcStore.getState().save(doc, savedBy);
    } catch (e) {
      window.alert('Lỗi: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100%', bgcolor: '#f4fefa' }}>
      <Box sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 40%,#14a08c)', color: '#fff', px: 3, py: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
          <Box>
            <Typography variant="h6" fontWeight={900}>🗂️ Hồ sơ thủ tục Visa</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              Mã: <strong style={{ fontFamily: 'monospace' }}>{doc.code}</strong>
              <span style={{ marginLeft: 8, opacity: 0.7 }}>· tự lưu{isOwner ? '' : ' · cộng tác'}</span>
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button color="inherit" variant="contained"
              startIcon={<DescriptionIcon />}
              onClick={() => void exportVisaProcDocx(doc)}
              sx={{ bgcolor: '#fff', color: '#0d7a6a' }}>
              Word
            </Button>
            <Button color="inherit" variant="contained"
              startIcon={<PictureAsPdfIcon />}
              onClick={() => exportVisaProcPDF(doc)}
              sx={{ bgcolor: '#fff', color: '#c0392b' }}>
              PDF
            </Button>
            <Button color="inherit" variant="outlined" startIcon={<HistoryIcon />}
              onClick={() => setShowVers(true)}>
              Phiên bản ({(doc.versions ?? []).length})
            </Button>
            <Button color="inherit" variant="outlined" startIcon={<SaveIcon />}
              onClick={saveVersion}>
              Lưu phiên bản
            </Button>
            {isOwner && (
              <Button color="inherit" variant="outlined" startIcon={<PeopleIcon />}
                onClick={() => setShowCollab(true)}>
                Cộng tác ({(doc.collaborators ?? []).length})
              </Button>
            )}
            <Button color="inherit" variant="outlined" startIcon={<SaveIcon />}
              onClick={() => void handleSaveNow()} disabled={saving}>
              {saving ? '⏳' : 'Lưu'}
            </Button>
            <UndoRedoButtons undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} color="#fff" />
            <Button color="inherit" variant="outlined" startIcon={<ArrowBackIcon />} onClick={onBack}>
              Quay lại
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
        <Paper sx={{ p: 3, mb: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr', gap: 1.5 }}>
            <TextField label="Tên hồ sơ" size="small" value={doc.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="VD: Hồ sơ visa Schengen - Đoàn ABC" />
            <TextField label="Quốc gia" size="small" value={doc.country}
              onChange={(e) => set('country', e.target.value)}
              placeholder="VD: Đức / Schengen" />
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary"
                sx={{ display: 'block', mb: 0.5 }}>
                🔗 Link Báo giá
              </Typography>
              <Select fullWidth size="small" value={doc.linkedQuoteId ?? ''}
                onChange={(e) => linkQuote(e.target.value)} displayEmpty>
                <MenuItem value="">— Không —</MenuItem>
                {quotes.map((q) => (
                  <MenuItem key={q.cloudId} value={q.cloudId}>
                    {q.quoteCode ? `[${q.quoteCode}] ` : ''}{q.name}
                  </MenuItem>
                ))}
              </Select>
            </Box>
          </Box>

          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
            <TextField
              select size="small" label="Loại visa" sx={{ minWidth: 170 }}
              value={doc.visaType ?? ''} onChange={(e) => set('visaType', e.target.value)}
            >
              <MenuItem value=""><em>—</em></MenuItem>
              {VISAP_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
            <FormControlLabel
              control={<Switch checked={!!doc.isTemplate} onChange={(e) => set('isTemplate', e.target.checked)} />}
              label="Dùng làm template mẫu"
            />
            <Button variant="outlined" size="small" startIcon={<AutoFixHighIcon />}
              onClick={() => setShowTpl(true)} disabled={templates.length === 0}>
              Áp dụng template ({templates.length})
            </Button>
          </Stack>

          {/* File hồ sơ đính kèm (sao lưu / cập nhật) */}
          <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed rgba(15,58,74,0.15)' }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              📎 File hồ sơ đính kèm
            </Typography>
            <Stack spacing={0.75}>
              {(doc.attachments ?? []).map((att, i) => (
                <Stack key={att.key} direction="row" alignItems="center" spacing={1}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Box component="a" href={workerFileUrl(att.key)} target="_blank" rel="noreferrer" title={att.name}
                      sx={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0d7a6a', textDecoration: 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', '&:hover': { textDecoration: 'underline' } }}>
                      📎 {att.name}
                    </Box>
                    {attMeta(att) && (
                      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.3 }}>{attMeta(att)}</Typography>
                    )}
                  </Box>
                  <Button size="small" color="error" onClick={() => removeAtt(i)}>Gỡ</Button>
                </Stack>
              ))}
              <Box>
                <Button component="label" variant="outlined" size="small" startIcon={<AttachFileIcon />} disabled={uploading}>
                  {uploading ? 'Đang tải lên…' : ((doc.attachments?.length ?? 0) ? 'Thêm / cập nhật file' : 'Đính kèm file (PDF/Word/ảnh…)')}
                  <Box component="input" type="file" hidden multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" onChange={onPickFiles} />
                </Button>
              </Box>
            </Stack>
          </Box>
        </Paper>

        <Stack spacing={2}>
          {doc.sections.map((s) => (
            <Paper key={s.id} variant="outlined" sx={{ overflow: 'hidden' }}>
              <Box sx={{ background: 'linear-gradient(135deg,#0f3a4a,#14566b)', color: '#fff', px: 1.75, py: 1.25, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography fontSize={17}>{PROC_KIND_ICON[s.kind] || '📋'}</Typography>
                <TextField size="small" variant="outlined" fullWidth
                  value={s.title}
                  onChange={(e) => updSection(s.id, (x) => ({ ...x, title: e.target.value }))}
                  sx={{ flex: 1, '& .MuiInputBase-input': { color: '#fff', fontWeight: 800 },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' } }} />
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {s.repeatable ? 'nhiều người' : 'đơn'}
                </Typography>
                <IconButton size="small" title="Xoá mục"
                  sx={{ bgcolor: 'rgba(220,50,80,0.25)', color: '#fff' }}
                  onClick={() => delSection(s.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>

              <Box sx={{ p: 2 }}>
                {s.repeatable ? (
                  <Box sx={{ overflowX: 'auto' }}>
                    <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', minWidth: s.fieldDefs.length * 150 }}>
                      <Box component="thead">
                        <Box component="tr">
                          <Box component="th" sx={{ width: 34, p: 0.5, fontSize: 11, color: 'text.disabled' }}>#</Box>
                          {s.fieldDefs.map((f) => (
                            <Box component="th" key={f.id} sx={{ p: 0.5, minWidth: 140 }}>
                              <Stack direction="row" alignItems="center" spacing={0.5}>
                                <TextField size="small" fullWidth value={f.label}
                                  onChange={(e) => updFieldLabel(s.id, f.id, e.target.value)}
                                  sx={{ '& .MuiInputBase-input': { fontSize: 11.5, fontWeight: 700, color: '#0d7a6a' },
                                        bgcolor: 'rgba(20,150,140,0.06)' }} />
                                <IconButton size="small" color="error"
                                  onClick={() => delField(s.id, f.id)} title="Xoá cột">
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Stack>
                            </Box>
                          ))}
                          <Box component="th" sx={{ width: 34 }}>
                            <IconButton size="small" onClick={() => addField(s.id)} title="Thêm cột"
                              sx={{ bgcolor: 'rgba(20,150,140,0.1)', color: '#0d7a6a' }}>
                              <AddIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Box>
                      </Box>
                      <Box component="tbody">
                        {s.rows.map((r, ri) => (
                          <Box component="tr" key={r.id}>
                            <Box component="td" sx={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'text.disabled' }}>
                              {ri + 1}
                            </Box>
                            {s.fieldDefs.map((f) => (
                              <Box component="td" key={f.id} sx={{ p: 0.5 }}>
                                <TextField fullWidth size="small"
                                  value={r.values[f.id] ?? ''}
                                  onChange={(e) => updCell(s.id, r.id, f.id, e.target.value)} />
                              </Box>
                            ))}
                            <Box component="td" sx={{ textAlign: 'center' }}>
                              <IconButton size="small" color="error" onClick={() => delRow(s.id, r.id)} title="Xoá người">
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                    <Button size="small" startIcon={<AddIcon />} onClick={() => addRow(s.id)}
                      sx={{ mt: 1, color: '#0d7a6a' }}>
                      Thêm người
                    </Button>
                  </Box>
                ) : (
                  <Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 1.5 }}>
                      {s.fieldDefs.map((f) => (
                        <Box key={f.id}>
                          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                            <TextField fullWidth size="small" value={f.label}
                              onChange={(e) => updFieldLabel(s.id, f.id, e.target.value)}
                              InputProps={{ sx: { fontSize: 11, fontWeight: 700, color: '#0d7a6a' } }}
                              variant="standard" />
                            <IconButton size="small" color="error"
                              onClick={() => delField(s.id, f.id)} title="Xoá trường">
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                          <TextField fullWidth size="small"
                            value={(s.rows[0] && s.rows[0].values[f.id]) || ''}
                            onChange={(e) => s.rows[0] && updCell(s.id, s.rows[0].id, f.id, e.target.value)} />
                        </Box>
                      ))}
                    </Box>
                    <Button size="small" startIcon={<AddIcon />} onClick={() => addField(s.id)}
                      sx={{ mt: 1, color: '#0d7a6a' }}>
                      Thêm trường
                    </Button>
                  </Box>
                )}
              </Box>
            </Paper>
          ))}
        </Stack>

        <Button variant="outlined" startIcon={<AddIcon />} onClick={addSection}
          sx={{ mt: 2, borderStyle: 'dashed', borderColor: 'rgba(20,150,140,0.4)', color: '#0d7a6a' }}>
          Thêm mục hồ sơ
        </Button>

        <Box sx={{ height: 40 }} />
      </Box>

      <Dialog open={showVers} onClose={() => setShowVers(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          🕐 Lịch sử phiên bản
          <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 1 }}>
            (tối đa 10)
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {(doc.versions ?? []).length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.disabled' }}>
              Chưa có phiên bản. Bấm "💾 Lưu phiên bản" để tạo mốc.
            </Box>
          )}
          {(doc.versions ?? []).map((v) => (
            <Paper key={v.versionNo} variant="outlined" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, mb: 1, bgcolor: 'rgba(168,230,221,0.1)' }}>
              <Box sx={{ bgcolor: '#0d7a6a', color: '#fff', borderRadius: 1, px: 1, py: 0.25, fontSize: 11, fontWeight: 800 }}>
                v{v.versionNo}
              </Box>
              <Box sx={{ flex: 1, fontSize: 12 }}>
                {new Date(v.savedAt).toLocaleString('vi-VN')}
                <Typography variant="caption" sx={{ display: 'block', opacity: 0.7 }}>
                  bởi {v.savedBy}
                </Typography>
              </Box>
              <Button size="small" variant="outlined" onClick={() => restoreVersion(v)}>
                Khôi phục
              </Button>
            </Paper>
          ))}
        </DialogContent>
      </Dialog>

      <Dialog open={showTpl} onClose={() => setShowTpl(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          ✨ Áp dụng template hồ sơ
          <Typography variant="caption" display="block" color="text.secondary">
            Chọn mẫu theo quốc gia / loại visa — nội dung mục hồ sơ sẽ được nạp vào.
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {templates.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.disabled' }}>
              Chưa có template nào. Bật “Dùng làm template mẫu” ở một hồ sơ để tạo.
            </Box>
          ) : templates.map((t) => {
            const match = (!!doc.country && t.country === doc.country) || (!!doc.visaType && t.visaType === doc.visaType);
            return (
              <Paper key={t.id} variant="outlined" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, mb: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={700} fontSize={14} noWrap>{t.title}</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }} flexWrap="wrap" useFlexGap>
                    {t.country && <Chip size="small" variant="outlined" label={`🌐 ${t.country}`} />}
                    {t.visaType && <Chip size="small" variant="outlined" label={t.visaType} />}
                    {match && <Chip size="small" color="success" label="Khớp" />}
                  </Stack>
                </Box>
                <Button size="small" variant="contained" onClick={() => void applyTemplate(t.id)}
                  sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
                  Áp dụng
                </Button>
              </Paper>
            );
          })}
        </DialogContent>
      </Dialog>

      {showCollab && (
        <VisaProcCollabModal
          doc={doc}
          onClose={() => setShowCollab(false)}
          onChange={(collabs) => set('collaborators', collabs)}
        />
      )}
    </Box>
  );
}
