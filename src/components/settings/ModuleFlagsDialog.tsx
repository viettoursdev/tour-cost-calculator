import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Switch,
  Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { DEPARTMENTS } from '@/auth/departments';
import { GATEABLE_MODULES, type ModuleFlags } from '@/lib/featureFlags';
import { useFeatureFlagStore } from '@/stores/featureFlagStore';
import { toast } from '@/stores/toastStore';
import type { Department } from '@/types';

type Props = { open: boolean; onClose: () => void };

/**
 * 🎛 Bật/tắt module theo phòng ban (chỉ BGĐ+ — RPC set_org_pref chặn server-side).
 * Chỉ gate điểm vào giao diện; dữ liệu & quyền không đổi. BGĐ luôn thấy đủ module.
 */
export function ModuleFlagsDialog({ open, onClose }: Props) {
  const saved = useFeatureFlagStore((s) => s.flags);
  const [draft, setDraft] = useState<ModuleFlags>(() => JSON.parse(JSON.stringify(saved)) as ModuleFlags);
  const [saving, setSaving] = useState(false);

  const isOn = (key: string) => !draft[key]?.off;
  const offDepts = (key: string) => new Set(draft[key]?.offDepts ?? []);

  const setModule = (key: string, patch: { off?: boolean; offDepts?: Department[] }) =>
    setDraft((d) => {
      const next = { ...d };
      const flag = { ...next[key], ...patch };
      if (!flag.off) delete flag.off;
      if (!flag.offDepts?.length) delete flag.offDepts;
      if (flag.off || flag.offDepts) next[key] = flag; else delete next[key];
      return next;
    });

  const toggleDept = (key: string, dept: Department) => {
    const s = offDepts(key);
    s.has(dept) ? s.delete(dept) : s.add(dept);
    setModule(key, { offDepts: [...s] });
  };

  const save = async () => {
    setSaving(true);
    try {
      await useFeatureFlagStore.getState().save(draft);
      toast('✅ Đã lưu cấu hình module. Nhân viên thấy thay đổi ở lần tải lại kế tiếp.');
      onClose();
    } catch (e) {
      toast('❌ ' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 6, fontWeight: 800 }}>
        🎛 Bật/tắt module theo phòng ban
        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontWeight: 400 }}>
          Tắt module đội mình không dùng cho gọn giao diện — chỉ ẩn điểm vào, không xoá dữ liệu.
          Ban Giám Đốc luôn thấy đủ module.
        </Typography>
        <IconButton onClick={onClose} disabled={saving} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {GATEABLE_MODULES.map((m) => {
            const on = isOn(m.key);
            const depts = offDepts(m.key);
            return (
              <Box key={m.key} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.25 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={700} fontSize={14}>{m.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{m.desc}</Typography>
                  </Box>
                  <Tooltip title={on ? 'Đang bật toàn công ty' : 'Đang TẮT toàn công ty'}>
                    <Switch checked={on} onChange={(e) => setModule(m.key, { off: !e.target.checked })} />
                  </Tooltip>
                </Stack>
                {on && (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mt: 0.75 }}>
                    <Typography variant="caption" color="text.disabled" sx={{ mr: 0.25 }}>Tắt riêng cho:</Typography>
                    {DEPARTMENTS.map((d) => {
                      const off = depts.has(d.id);
                      return (
                        <Chip
                          key={d.id} size="small" clickable label={`${d.icon} ${d.label}`}
                          color={off ? 'error' : 'default'}
                          variant={off ? 'filled' : 'outlined'}
                          onClick={() => toggleDept(m.key, d.id)}
                        />
                      );
                    })}
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={saving} color="inherit">Huỷ</Button>
        <Button variant="contained" onClick={() => void save()} disabled={saving} sx={{ fontWeight: 700 }}>
          {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
