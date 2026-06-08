import { useState } from 'react';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Dialog, DialogContent,
  DialogTitle, Stack, Typography,
} from '@mui/material';
import { TEMPLATES } from './constants';
import { useQuoteStore } from '@/stores/quoteStore';
import type { Template } from '@/types';

// Tiles for templates that aren't ported yet. Source: public/legacy.html:1662-1665.
const COMING_SOON_TILES = [
  { key: 'itinerary',   icon: '🗺️', label: 'Chương trình tour', desc: 'Tạo lịch trình tour theo ngày, xuất Word/PDF' },
  { key: 'menu',        icon: '🍽️', label: 'Thư viện thực đơn', desc: 'Quản lý thực đơn theo nhà hàng, xuất Word/PDF' },
  { key: 'visa',        icon: '🛂',  label: 'Quản lý Visa',       desc: 'Bảng giá visa & hồ sơ thủ tục' },
  { key: 'doctranslate',icon: '📑',  label: 'Dịch hồ sơ',         desc: 'Dịch Word/PDF/scan Việt→Anh' },
];

const LEGACY_URL = '/tour-cost-calculator/legacy.html';

type Props = { open: boolean; onClose?: () => void; canCancel?: boolean };

export function TemplateSelectorModal({ open, onClose, canCancel = false }: Props) {
  // Narrow selectors — modal only needs to know whether a draft exists and whether
  // it has items. Subscribing to the whole `draft` would re-render this on every
  // keystroke in the cost view.
  const hasDraft = useQuoteStore((s) => s.draft.template !== null);
  const hasItems = useQuoteStore((s) => Object.keys(s.draft.items).length > 0);
  const newDraft = useQuoteStore((s) => s.newDraft);
  const [pendingConfirm, setPendingConfirm] = useState<Template | null>(null);

  const handlePick = (key: Template) => {
    if (hasDraft && hasItems) {
      setPendingConfirm(key);
    } else {
      newDraft(key);
      onClose?.();
    }
  };

  const confirmReplace = () => {
    if (pendingConfirm) {
      newDraft(pendingConfirm);
      setPendingConfirm(null);
      onClose?.();
    }
  };

  return (
    <Dialog open={open} onClose={canCancel ? onClose : undefined} fullScreen>
      <DialogTitle>
        🎯 Chọn yêu cầu Báo giá
        {canCancel && (
          <Button onClick={onClose} sx={{ float: 'right' }}>Đóng</Button>
        )}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Hệ thống sẽ cấu hình hạng mục phù hợp với loại báo giá bạn chọn
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 2,
            mb: 4,
          }}
        >
          {(Object.values(TEMPLATES) as Array<typeof TEMPLATES[Template]>).map((tpl) => (
            <Card key={tpl.key} variant="outlined">
              <CardActionArea onClick={() => handlePick(tpl.key)} sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h3" sx={{ mb: 1 }}>{tpl.icon}</Typography>
                  <Typography fontWeight={700}>{tpl.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {tpl.desc}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Các template sau vẫn chỉ có trong bản cũ:
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {COMING_SOON_TILES.map((tile) => (
            <Button
              key={tile.key}
              variant="outlined"
              size="small"
              href={`${LEGACY_URL}#tpl=${tile.key}`}
              target="_blank"
              rel="noopener"
            >
              {tile.icon} {tile.label}
            </Button>
          ))}
        </Stack>

        {pendingConfirm && (
          <Alert
            severity="warning"
            sx={{ mt: 3 }}
            action={
              <>
                <Button color="inherit" size="small" onClick={() => setPendingConfirm(null)}>
                  Huỷ
                </Button>
                <Button color="inherit" size="small" onClick={confirmReplace}>
                  Thay thế
                </Button>
              </>
            }
          >
            Báo giá hiện tại sẽ bị thay thế. Tiếp tục?
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
