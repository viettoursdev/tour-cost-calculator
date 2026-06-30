import { useRef, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, Dialog, DialogContent, DialogTitle,
  IconButton, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import { exportUsersExcel, parseUsersExcel } from '@/lib/exports/usersExcel';
import { useAuthStore } from '@/stores/authStore';
import { PERMISSIONS } from '@/auth/PERMISSIONS';
import { ROLES, USER_COLORS, DEFAULT_USERS } from '@/auth/ROLES';
import { DEPARTMENTS, DEPT_LABEL } from '@/auth/departments';
import type { Department, Role, User } from '@/types';

type Props = {
  open: boolean;
  onClose: () => void;
  currentUser: User;
};

type FormState = Pick<User, 'u' | 'p' | 'name' | 'role' | 'color'> & { email: string; phone: string; department?: Department };

const EMPTY_FORM: FormState = { u: '', email: '', phone: '', p: '', name: '', role: 'Sales', department: undefined, color: USER_COLORS[2] };

const MATRIX_KEYS: { key: keyof typeof PERMISSIONS['CEO']; label: string }[] = [
  { key: 'manageUsers',  label: 'QL tài khoản' },
  { key: 'editRateCard', label: 'Sửa Rate Card' },
  { key: 'syncRateCard', label: 'Đồng bộ RC' },
  { key: 'exportQuote',  label: 'Xuất báo giá' },
  { key: 'importQuote',  label: 'Nhập file' },
  { key: 'viewHistory',  label: 'Lịch sử' },
  { key: 'manageContracts', label: 'Hợp đồng' },
];

export function UserManagementModal({ open, onClose, currentUser }: Props) {
  const users = useAuthStore((s) => s.users);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const persist = (next: User[]) => useAuthStore.getState().saveUsers(next);

  // Tài khoản đăng nhập chỉ tồn tại sau khi người đó đăng nhập magic-link lần đầu
  // (trigger handle_new_user tạo profiles). Panel này CHƯA tạo được auth user mới,
  // nên báo rõ thay vì để tài khoản mới biến mất khi tải lại trang.
  const NEW_ACCOUNT_HINT =
    'Tài khoản đăng nhập chỉ được tạo sau khi người đó tự đăng nhập lần đầu bằng ' +
    'link gửi tới email @viettours.com.vn. Hãy nhờ họ đăng nhập một lần, sau đó ' +
    'bạn mới gán được chức vụ / phòng ban ở đây.';

  const handleExport = async () => {
    try {
      setBusy(true);
      await exportUsersExcel(users);
    } catch (e) {
      window.alert(`Xuất Excel lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      setBusy(true);
      const { next, added, updated, errors } = await parseUsersExcel(file, users);
      if (added === 0 && updated === 0) {
        window.alert(
          errors.length
            ? `Không có thay đổi nào được áp dụng.\n\n${errors.slice(0, 12).join('\n')}`
            : 'File không có tài khoản mới hay thay đổi nào.',
        );
        return;
      }
      const summary =
        `Áp dụng thay đổi từ Excel?\n\n• Thêm mới: ${added} tài khoản\n• Cập nhật: ${updated} tài khoản\n` +
        (errors.length ? `• Bỏ qua (lỗi): ${errors.length} dòng\n\n${errors.slice(0, 8).join('\n')}${errors.length > 8 ? '\n…' : ''}\n` : '') +
        `\n⚠️ Không tài khoản nào bị xoá.`;
      if (!window.confirm(summary)) return;
      const skipped = await persist(next);
      if (skipped.length) {
        const names = skipped.map((u) => `@${u.u} (${u.email || 'thiếu email'})`);
        window.alert(
          `⚠️ Đã cập nhật ${updated} tài khoản có sẵn, NHƯNG ${skipped.length} tài khoản MỚI chưa lưu được:\n\n` +
            `${names.slice(0, 15).join('\n')}${names.length > 15 ? '\n…' : ''}\n\n${NEW_ACCOUNT_HINT}`,
        );
      } else {
        window.alert(`✅ Đã cập nhật danh sách tài khoản (thêm ${added}, sửa ${updated}).`);
      }
    } catch (e) {
      window.alert(`Nhập Excel lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const startAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };
  const startEdit = (usr: User) => {
    setEditingId(usr.u);
    setForm({ u: usr.u, email: usr.email ?? '', phone: usr.phone ?? '', p: usr.p, name: usr.name, role: usr.role, department: usr.department, color: usr.color });
    setShowForm(true);
  };

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.u.trim()) { window.alert('Vui lòng nhập Username'); return; }
    if (!form.name.trim()) { window.alert('Vui lòng nhập Tên hiển thị'); return; }
    const email = form.email.trim().toLowerCase();
    if (!email) { window.alert('Vui lòng nhập Email công ty'); return; }
    if (!email.endsWith('@viettours.com.vn')) {
      window.alert('Email phải kết thúc bằng @viettours.com.vn');
      return;
    }
    const username = form.u.trim().toLowerCase();
    if (!editingId && users.some((x) => x.u === username)) {
      window.alert('Username này đã tồn tại');
      return;
    }
    if (users.some((x) => x.u !== editingId && (x.email ?? '').toLowerCase() === email)) {
      window.alert('Email này đã được dùng cho tài khoản khác');
      return;
    }
    const phone = form.phone.trim();
    const legacyPassword = editingId ? (users.find((x) => x.u === editingId)?.p ?? '') : '';
    const newUser: User = {
      u: username,
      email,
      ...(phone ? { phone } : {}),
      p: legacyPassword,
      name: form.name.trim(),
      role: form.role,
      ...(form.department ? { department: form.department } : {}),
      color: form.color,
    };
    const next = editingId
      ? users.map((x) => (x.u === editingId ? newUser : x))
      : [...users, newUser];
    const skipped = await persist(next);
    if (skipped.some((x) => x.u === newUser.u)) {
      window.alert(`⚠️ Chưa lưu được tài khoản mới "@${newUser.u}".\n\n${NEW_ACCOUNT_HINT}`);
      return;
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = (usr: User) => {
    if (usr.u === currentUser.u) {
      window.alert('Không thể xoá tài khoản đang đăng nhập');
      return;
    }
    if (usr.role === 'CEO' && users.filter((x) => x.role === 'CEO').length <= 1) {
      window.alert('Phải còn ít nhất 1 tài khoản CEO');
      return;
    }
    if (!window.confirm(`Xoá tài khoản "${usr.u}" (${usr.name})?`)) return;
    persist(users.filter((x) => x.u !== usr.u));
  };

  const resetDefaults = () => {
    if (!window.confirm('Reset về danh sách tài khoản mặc định? Mọi thay đổi sẽ mất.')) return;
    persist([...DEFAULT_USERS]);
    setShowForm(false);
    setEditingId(null);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ background: 'linear-gradient(135deg,#dc3250,#c0392b)', color: '#fff' }}>
        <Typography variant="h6" fontWeight={800}>👤 Quản lý tài khoản</Typography>
        <Typography variant="caption" sx={{ opacity: 0.85 }}>
          Chỉ CEO mới có quyền · {users.length} tài khoản đang hoạt động
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <Button variant="contained" color="success" startIcon={<AddIcon />} onClick={startAdd}>
            Thêm tài khoản mới
          </Button>
          <Button variant="outlined" color="success" startIcon={<FileDownloadOutlinedIcon />} onClick={() => void handleExport()} disabled={busy}>
            Xuất Excel
          </Button>
          <Button variant="outlined" color="success" startIcon={<FileUploadOutlinedIcon />} onClick={() => fileRef.current?.click()} disabled={busy}>
            Nhập Excel
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ''; // cho phép chọn lại cùng file
              if (f) void handleImportFile(f);
            }}
          />
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" color="inherit" startIcon={<RestartAltIcon />} onClick={resetDefaults}>
            Reset mặc định
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -1, mb: 2 }}>
          💡 <strong>Xuất Excel</strong> để sửa hàng loạt chức vụ &amp; phòng ban, rồi <strong>Nhập Excel</strong> để áp lại
          (đối chiếu theo Username — chỉ thêm/cập nhật, không xoá ai).
        </Typography>

        {showForm && (
          <Paper variant="outlined" sx={{ p: 2.25, mb: 2, bgcolor: 'rgba(168,230,221,0.18)', borderColor: 'rgba(20,150,140,0.3)' }}>
            <Typography fontWeight={800} sx={{ color: '#0d7a6a', mb: 2 }}>
              {editingId ? `✏️ Sửa tài khoản: ${editingId}` : '➕ Thêm tài khoản mới'}
            </Typography>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1.5}>
                <TextField
                  label="Username"
                  value={form.u}
                  onChange={(e) => setF('u', e.target.value)}
                  disabled={!!editingId}
                  size="small" fullWidth
                  placeholder="vd: sale4"
                />
              </Stack>
              <Stack direction="row" spacing={1.5}>
                <TextField
                  label="Email công ty"
                  value={form.email}
                  onChange={(e) => setF('email', e.target.value)}
                  size="small" fullWidth
                  placeholder="vd: sale4@viettours.com.vn"
                  helperText="Email công ty dùng để nhận link đăng nhập"
                />
                <TextField
                  label="Số điện thoại"
                  value={form.phone}
                  onChange={(e) => setF('phone', e.target.value)}
                  size="small" fullWidth
                  placeholder="vd: 0901 234 567"
                  helperText="Hiển thị trên báo giá xuất ra"
                />
              </Stack>
              <Stack direction="row" spacing={1.5}>
                <TextField
                  label="Tên hiển thị"
                  value={form.name}
                  onChange={(e) => setF('name', e.target.value)}
                  size="small" fullWidth
                  placeholder="vd: Nguyễn Văn A"
                />
                <Select
                  value={form.role}
                  onChange={(e) => setF('role', e.target.value as Role)}
                  size="small" fullWidth
                >
                  {ROLES.map((r) => (
                    <MenuItem key={r} value={r}>{r}</MenuItem>
                  ))}
                </Select>
                <Select
                  displayEmpty
                  value={form.department ?? ''}
                  onChange={(e) => setF('department', (e.target.value || undefined) as Department | undefined)}
                  size="small" fullWidth
                >
                  <MenuItem value=""><em>— Chưa gán phòng (toàn quyền) —</em></MenuItem>
                  {DEPARTMENTS.map((d) => (
                    <MenuItem key={d.id} value={d.id}>{d.icon} {d.label}</MenuItem>
                  ))}
                </Select>
              </Stack>
              <Box>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Màu nhận diện
                </Typography>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  {USER_COLORS.map((c) => (
                    <Box
                      key={c}
                      onClick={() => setF('color', c)}
                      sx={{
                        width: 30, height: 30, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                        border: '2px solid',
                        borderColor: form.color === c ? '#0f3a4a' : 'rgba(15,58,74,0.1)',
                        boxShadow: form.color === c ? '0 0 0 2px #fff inset' : 'none',
                      }}
                    />
                  ))}
                </Stack>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button fullWidth onClick={() => { setShowForm(false); setEditingId(null); }}>
                  Huỷ
                </Button>
                <Button fullWidth variant="contained" color="success" onClick={() => void handleSave()} sx={{ flex: 2 }}>
                  {editingId ? '💾 Lưu thay đổi' : '➕ Tạo tài khoản'}
                </Button>
              </Stack>
            </Stack>
          </Paper>
        )}

        <Stack spacing={1}>
          {users.map((usr) => {
            const self = usr.u === currentUser.u;
            return (
              <Paper key={usr.u} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar sx={{ bgcolor: usr.color, width: 42, height: 42, fontWeight: 800 }}>
                  {usr.name.charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Typography fontWeight={700} fontSize={14}>{usr.name}</Typography>
                    <Chip
                      label={usr.role}
                      size="small"
                      sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: usr.color + '22', color: usr.color }}
                    />
                    {usr.department && (
                      <Chip
                        label={DEPT_LABEL[usr.department]}
                        size="small"
                        sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(124,58,237,0.12)', color: '#7c3aed' }}
                      />
                    )}
                    {self && (
                      <Chip
                        label="Đang đăng nhập"
                        size="small"
                        sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(39,174,96,0.15)', color: '#27ae60' }}
                      />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    @{usr.u} · {usr.email ?? <Box component="span" sx={{ color: '#dc3250', fontWeight: 700 }}>Chưa có email — không thể đăng nhập</Box>}
                    {usr.phone ? ` · ☎ ${usr.phone}` : ''}
                  </Typography>
                </Box>
                <IconButton size="small" color="primary" onClick={() => startEdit(usr)}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDelete(usr)}
                  disabled={self}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Paper>
            );
          })}
        </Stack>

        <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(20,150,140,0.05)', border: '1px solid rgba(20,150,140,0.2)', borderRadius: 1.5 }}>
          <Typography variant="caption" fontWeight={700} sx={{ color: '#0d7a6a', letterSpacing: 1, textTransform: 'uppercase' }}>
            🔐 Ma trận phân quyền
          </Typography>
          <TableContainer sx={{ mt: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'rgba(20,150,140,0.08)' }}>
                  <TableCell sx={{ fontWeight: 700, color: '#0d7a6a' }}>Vai trò</TableCell>
                  {MATRIX_KEYS.map((k) => (
                    <TableCell key={k.key} align="center" sx={{ fontWeight: 700, color: '#0d7a6a' }}>
                      {k.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {ROLES.map((role) => (
                  <TableRow key={role}>
                    <TableCell sx={{ fontWeight: 600, color: role === 'NV Thử việc' ? '#dc3250' : 'text.primary' }}>
                      {role}{role === 'NV Thử việc' ? ' 🔒' : ''}
                    </TableCell>
                    {MATRIX_KEYS.map((k) => (
                      <TableCell key={k.key} align="center">
                        {PERMISSIONS[role][k.key] ? '✅' : '—'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" sx={{ display: 'block', mt: 1, pt: 1, borderTop: '1px dashed rgba(20,150,140,0.2)', color: 'text.secondary', lineHeight: 1.6 }}>
            💡 <strong>NV Thử việc</strong> là cấp thấp nhất — chỉ tạo & xem báo giá, không sửa rate card, không xuất file, không xem lịch sử.
          </Typography>
        </Box>

        <Alert severity="warning" sx={{ mt: 2 }}>
          <strong>Lưu ý:</strong> Mỗi tài khoản phải có email @viettours.com.vn để nhận link đăng nhập (Phase 2). Mật khẩu lưu dạng văn bản thô (tạm thời — sẽ xoá ở Phase 4).
        </Alert>
      </DialogContent>
    </Dialog>
  );
}
