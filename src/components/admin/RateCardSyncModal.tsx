import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogContent, DialogTitle, Paper, Stack, Tab,
  Tabs, Typography,
} from '@mui/material';
import { toast } from '@/stores/toastStore';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { sbPullMasterRC, sbPushMasterRC, sbSubscribeMasterRC } from '@/lib/supabase';
import { useRateCardStore } from '@/stores/rateCardStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import type { RateCard, RateCardDoc, User } from '@/types';

type Tab = 'cloud' | 'export' | 'import';

interface ImportPreview {
  data: RateCard;
  hotelCities: number;
  hotelCount: number;
  visaCountries: number;
}

type Props = {
  open: boolean;
  onClose: () => void;
  currentUser: User;
};

function buildPayload(rc: RateCard, who: string, kind: 'pushedBy' | 'exportedBy') {
  return {
    _meta: {
      version: '2.0',
      type: 'viettours_ratecard_master',
      ...(kind === 'pushedBy'
        ? { pushedAt: new Date().toISOString(), pushedBy: who }
        : { exportedAt: new Date().toISOString(), exportedBy: who }),
      app: 'Viettours Tour Cost Calculator',
    },
    hotels: rc.hotels,
    visaRates: rc.visaRates,
    otherRates: rc.otherRates,
  };
}

function countHotels(rc: { hotels?: Record<string, unknown[]> } | null) {
  if (!rc?.hotels) return { cities: 0, total: 0 };
  const cities = Object.keys(rc.hotels).length;
  const total = Object.values(rc.hotels).reduce(
    (s, arr) => s + (Array.isArray(arr) ? arr.length : 0),
    0,
  );
  return { cities, total };
}

export function RateCardSyncModal({ open, onClose, currentUser }: Props) {
  const [tab, setTab] = useState<Tab>('cloud');
  const [cloudData, setCloudData] = useState<RateCardDoc | null>(null);
  const [cloudLoading, setCloudLoading] = useState(true);
  const [cloudStatus, setCloudStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const localRates = useRateCardStore((s) => s.rates);
  const canPush = hasPerm(currentUser, 'syncRateCard');

  useEffect(() => {
    if (!open) return;
    setCloudLoading(true);
    setCloudStatus(null);
    let cancelled = false;
    void sbPullMasterRC().then((d) => {
      if (!cancelled) {
        setCloudData(d);
        setCloudLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setCloudLoading(false);
    });
    const unsub = sbSubscribeMasterRC((d) => {
      if (!cancelled) setCloudData(d);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [open]);

  const localStats = countHotels(localRates);
  const localVisaCountries = Object.keys(localRates.visaRates).length;
  const localOtherCount = Object.keys(localRates.otherRates).length;

  const cloudStats = countHotels(cloudData);
  const cloudVisaCountries = cloudData ? Object.keys(cloudData.visaRates ?? {}).length : 0;
  const cloudOtherCount = cloudData ? Object.keys(cloudData.otherRates ?? {}).length : 0;
  const cloudMeta = cloudData?._meta as undefined | {
    pushedBy?: string; pushedAt?: string; exportedBy?: string; exportedAt?: string;
  };

  const who = `${currentUser.name} (${currentUser.role})`;

  const handlePush = async () => {
    if (!window.confirm('Đẩy rate card hiện tại lên cloud?\n\n⚠ Dữ liệu cloud sẽ bị ghi đè. Tất cả tài khoản kéo về sẽ nhận bản mới này.')) return;
    setPushing(true); setCloudStatus(null);
    try {
      await sbPushMasterRC(localRates, who);
      setCloudStatus({ type: 'success', msg: '✅ Đẩy lên cloud thành công! Tất cả tài khoản có thể kéo về ngay.' });
    } catch (err) {
      setCloudStatus({ type: 'error', msg: '❌ Lỗi: ' + (err as Error).message });
    } finally {
      setPushing(false);
    }
  };

  const handlePull = async () => {
    if (!cloudData) return;
    if (!window.confirm('Kéo rate card từ cloud về máy này?\n\n⚠ Rate card hiện tại trên máy sẽ bị ghi đè!')) return;
    setPulling(true); setCloudStatus(null);
    try {
      useRateCardStore.setState({
        rates: {
          hotels: cloudData.hotels ?? {},
          visaRates: cloudData.visaRates ?? {},
          otherRates: cloudData.otherRates ?? {},
        },
      });
      setCloudStatus({ type: 'success', msg: '✅ Đồng bộ thành công! Đang tải lại...' });
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setCloudStatus({ type: 'error', msg: '❌ Lỗi: ' + (err as Error).message });
      setPulling(false);
    }
  };

  const handleExport = () => {
    const payload = buildPayload(localRates, who, 'exportedBy');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Viettours_RateCard_Master_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = String(ev.target?.result ?? '');
        const parsed = JSON.parse(raw) as { _meta?: { type?: string } } & RateCard;
        if (!parsed._meta || parsed._meta.type !== 'viettours_ratecard_master') {
          window.alert('⚠ File không phải Master Rate Card hợp lệ');
          return;
        }
        const stats = countHotels(parsed);
        setImportPreview({
          data: {
            hotels: parsed.hotels ?? {},
            visaRates: parsed.visaRates ?? {},
            otherRates: parsed.otherRates ?? {},
          },
          hotelCities: stats.cities,
          hotelCount: stats.total,
          visaCountries: Object.keys(parsed.visaRates ?? {}).length,
        });
      } catch (err) {
        window.alert('⚠ Lỗi đọc file: ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyImport = () => {
    if (!importPreview) return;
    if (!window.confirm('Áp dụng master rate card này?\n\n⚠ Toàn bộ rate card hiện tại trên máy này sẽ bị ghi đè!')) return;
    useRateCardStore.setState({ rates: importPreview.data });
    toast('✅ Đồng bộ tỷ giá thành công! Tải lại trang để áp dụng đầy đủ.', 'success');
    setImportPreview(null);
    onClose();
    setTimeout(() => window.location.reload(), 500);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ background: 'linear-gradient(135deg,#8e44ad,#9b59b6)', color: '#fff' }}>
        <Typography variant="h6" fontWeight={800}>🗂️ Đồng bộ Master Rate Card</Typography>
        <Typography variant="caption" sx={{ opacity: 0.85 }}>
          Đồng bộ real-time qua Supabase · hoặc xuất/nhập file
        </Typography>
      </DialogTitle>
      <Tabs
        value={tab}
        onChange={(_, v: Tab) => setTab(v)}
        variant="fullWidth"
        sx={{
          bgcolor: 'rgba(168,230,221,0.1)',
          '& .MuiTabs-indicator': { bgcolor: '#8e44ad', height: 3 },
        }}
      >
        <Tab value="cloud" label="☁️ Cloud Sync" />
        <Tab value="export" label="📤 Xuất file" />
        <Tab value="import" label="📥 Nhập file" />
      </Tabs>
      <DialogContent dividers>
        {tab === 'cloud' && (
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(168,230,221,0.2)', borderColor: 'rgba(20,150,140,0.2)' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="caption" fontWeight={700} sx={{ color: 'text.secondary', letterSpacing: 1, textTransform: 'uppercase' }}>
                  ☁️ Dữ liệu trên Cloud (Supabase)
                </Typography>
                <Typography variant="caption" fontWeight={700} sx={{ color: cloudLoading ? '#d18a13' : cloudData ? '#0d7a6a' : '#dc3250' }}>
                  {cloudLoading ? '⏳ Đang tải...' : cloudData ? '🟢 Đã kết nối' : '⚪ Chưa có dữ liệu'}
                </Typography>
              </Stack>
              {cloudLoading && (
                <Box sx={{ textAlign: 'center', py: 2, color: 'text.disabled' }}>
                  Đang tải dữ liệu cloud...
                </Box>
              )}
              {!cloudLoading && !cloudData && (
                <Box sx={{ textAlign: 'center', py: 2, color: 'text.disabled' }}>
                  Cloud chưa có dữ liệu. Hãy đẩy lần đầu từ máy CEO/Admin.
                </Box>
              )}
              {!cloudLoading && cloudData && (
                <>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, mb: 1 }}>
                    <StatCard icon="🏨" label="Khách sạn" value={cloudStats.total} sub={`${cloudStats.cities} thành phố`} />
                    <StatCard icon="🛂" label="Visa custom" value={cloudVisaCountries} sub="quốc gia" />
                    <StatCard icon="📋" label="Rate cards" value={cloudOtherCount} sub="loại" />
                  </Box>
                  {cloudMeta && (
                    <Typography variant="caption" sx={{ display: 'block', pt: 1, borderTop: '1px dashed rgba(20,150,140,0.2)', color: 'text.secondary' }}>
                      Cập nhật bởi: <strong>{cloudMeta.pushedBy ?? cloudMeta.exportedBy ?? '—'}</strong> ·{' '}
                      {cloudMeta.pushedAt ? new Date(cloudMeta.pushedAt).toLocaleString('vi-VN') :
                        cloudMeta.exportedAt ? new Date(cloudMeta.exportedAt).toLocaleString('vi-VN') : '—'}
                    </Typography>
                  )}
                </>
              )}
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(245,166,35,0.07)', borderColor: 'rgba(245,166,35,0.2)' }}>
              <Typography variant="caption" fontWeight={700} sx={{ color: 'text.secondary', letterSpacing: 1, textTransform: 'uppercase', display: 'block', mb: 1 }}>
                💻 Dữ liệu trên máy này
              </Typography>
              <Stack direction="row" spacing={2.5} sx={{ color: 'text.secondary' }}>
                <span>🏨 {localStats.total} khách sạn ({localStats.cities} tp)</span>
                <span>🛂 {localVisaCountries} visa</span>
                <span>📋 {localOtherCount} rate cards</span>
              </Stack>
            </Paper>

            {cloudStatus && (
              <Alert severity={cloudStatus.type === 'success' ? 'success' : 'error'}>
                {cloudStatus.msg}
              </Alert>
            )}

            <Stack direction="row" spacing={1.25}>
              {canPush && (
                <Button
                  variant="contained"
                  startIcon={<CloudUploadIcon />}
                  onClick={handlePush}
                  disabled={pushing}
                  sx={{ flex: 1, background: 'linear-gradient(135deg,#8e44ad,#9b59b6)' }}
                >
                  {pushing ? '⏳ Đang đẩy...' : 'Đẩy lên Cloud'}
                </Button>
              )}
              <Button
                variant="contained"
                color="success"
                startIcon={<CloudDownloadIcon />}
                onClick={handlePull}
                disabled={pulling || cloudLoading || !cloudData}
                sx={{ flex: 1 }}
              >
                {pulling ? '⏳ Đang kéo...' : 'Kéo từ Cloud'}
              </Button>
            </Stack>
            {!canPush && (
              <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center' }}>
                🔒 Chỉ CEO / Ban Giám Đốc / Trưởng Phòng / Operations / Sales / Marketing mới có thể đẩy lên cloud
              </Typography>
            )}
            <Alert severity="info" sx={{ fontSize: 12 }}>
              Mọi chỉnh sửa rate card đã được tự động đồng bộ với cloud (debounce 2s). Nút "Đẩy lên Cloud" dùng cho thao tác đẩy chủ động ngay lập tức.
            </Alert>
          </Stack>
        )}

        {tab === 'export' && (
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(168,230,221,0.2)', borderColor: 'rgba(20,150,140,0.2)' }}>
              <Typography variant="caption" fontWeight={700} sx={{ color: 'text.secondary', letterSpacing: 1, textTransform: 'uppercase', display: 'block', mb: 1 }}>
                Dữ liệu hiện tại trên máy này
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1.25 }}>
                <StatCard icon="🏨" label="Khách sạn" value={localStats.total} sub={`${localStats.cities} thành phố`} />
                <StatCard icon="🛂" label="Visa custom" value={localVisaCountries} sub="quốc gia đã chỉnh giá" />
                <StatCard icon="📅" label="Xuất bởi" value={currentUser.name} sub={currentUser.role} />
              </Box>
            </Paper>
            <Button
              variant="contained"
              startIcon={<FileDownloadIcon />}
              onClick={handleExport}
              sx={{ background: 'linear-gradient(135deg,#8e44ad,#9b59b6)' }}
            >
              Xuất file Master Rate Card
            </Button>
          </Stack>
        )}

        {tab === 'import' && (
          <Stack spacing={2}>
            {!importPreview && (
              <>
                <Alert severity="warning">
                  <strong>Cảnh báo:</strong> Nhập master rate card sẽ <strong>ghi đè toàn bộ</strong> rate card hiện tại trên máy này.
                </Alert>
                <Button
                  variant="outlined"
                  startIcon={<FileUploadIcon />}
                  onClick={() => fileRef.current?.click()}
                  sx={{
                    py: 3,
                    border: '2px dashed rgba(155,89,182,0.4)',
                    color: '#8e44ad',
                    '&:hover': { border: '2px dashed #8e44ad' },
                  }}
                >
                  Chọn file Master Rate Card (.json)
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelect}
                  hidden
                />
              </>
            )}
            {importPreview && (
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(168,230,221,0.2)', borderColor: 'rgba(20,150,140,0.3)' }}>
                <Typography variant="caption" fontWeight={700} sx={{ color: '#0d7a6a', letterSpacing: 1, textTransform: 'uppercase', display: 'block', mb: 1 }}>
                  ✓ File hợp lệ – Xem trước
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 1.25, mb: 1.5 }}>
                  <StatCard icon="🏨" label="Khách sạn" value={importPreview.hotelCount} sub={`${importPreview.hotelCities} thành phố`} />
                  <StatCard icon="🛂" label="Visa custom" value={importPreview.visaCountries} sub="quốc gia" />
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button fullWidth onClick={() => setImportPreview(null)}>Huỷ</Button>
                  <Button fullWidth variant="contained" color="success" onClick={handleApplyImport}>
                    ✅ Áp dụng
                  </Button>
                </Stack>
              </Paper>
            )}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderColor: 'rgba(20,150,140,0.1)' }}>
      <Typography variant="caption" color="text.secondary">{icon} {label}</Typography>
      <Typography fontWeight={800} fontSize={18}>{value}</Typography>
      <Typography variant="caption" color="text.disabled">{sub}</Typography>
    </Paper>
  );
}
