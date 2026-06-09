import { useState } from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2';
import { useRateCardStore } from '@/stores/rateCardStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { HotelModal } from './HotelModal';
import { VisaModal } from './VisaModal';
import { RateCardModal } from './RateCardModal';
import { RATE_CATEGORIES } from './constants';
import type { Template } from '@/types';

/**
 * Per-template visibility rules for rate-card tiles.
 * Source: public/legacy.html:8707-8716. Categories not in this map default to "always show".
 */
function isRateCategoryVisible(key: string, template: Template | null): boolean {
  // No active template (template selector not yet picked) → show everything so
  // the user can still edit rate cards from the Rates tab without a draft.
  if (!template) return true;
  switch (key) {
    case 'insurance':
    case 'logistics':
    case 'gala':
      return template !== 'dmc';
    case 'dmc':
      return template === 'intl';
    case 'teambuild':
    case 'meeting':
      return template === 'domestic';
    default:
      // hotel, transport, staff, visa, and anything else: always shown
      return true;
  }
}

type ModalState =
  | { kind: 'none' }
  | { kind: 'hotel' }
  | { kind: 'visa' }
  | { kind: 'other'; type: string; label: string };

export function RatesPanel() {
  const status = useRateCardStore((s) => s.status);
  const hotels = useRateCardStore((s) => s.rates.hotels);
  const visaRates = useRateCardStore((s) => s.rates.visaRates);
  const otherRates = useRateCardStore((s) => s.rates.otherRates);
  const template = useQuoteStore((s) => s.draft.template);

  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

  const visibleCategories = RATE_CATEGORIES.filter((c) => isRateCategoryVisible(c.key, template));

  const cityCount = Object.keys(hotels).filter(
    (k) => Array.isArray(hotels[k]) && (hotels[k] as unknown[]).length > 0,
  ).length;
  const visaCountryCount = Object.keys(visaRates).length;
  const otherKeysCount = Object.keys(otherRates).length;

  const openFor = (key: string, label: string) => {
    if (key === 'hotel') setModal({ kind: 'hotel' });
    else if (key === 'visa') setModal({ kind: 'visa' });
    else setModal({ kind: 'other', type: key, label });
  };

  const countFor = (key: string): number => {
    if (key === 'hotel') return cityCount;
    if (key === 'visa') return visaCountryCount;
    const v = otherRates[`vte_rate_${key}`];
    if (Array.isArray(v)) return v.length;
    return 0;
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 700 }}>
          📋 Quản lý Rate Card
        </Typography>
        <Chip
          size="small"
          color={status === 'syncing' ? 'warning' : status === 'error' ? 'error' : 'success'}
          label={
            status === 'syncing'
              ? 'Đang đồng bộ…'
              : status === 'error'
                ? 'Lỗi đồng bộ'
                : 'Đã đồng bộ'
          }
        />
      </Stack>

      <Alert severity="info" sx={{ mb: 3 }}>
        Bảng giá được lưu trên cloud và tự đồng bộ giữa các thiết bị. Mọi chỉnh sửa sẽ được
        đẩy lên Firestore sau ~2 giây.
        <br />
        Tổng cộng: <strong>{cityCount}</strong> thành phố có khách sạn ·{' '}
        <strong>{visaCountryCount}</strong> quốc gia visa ·{' '}
        <strong>{otherKeysCount}</strong> hạng mục khác đã lưu.
      </Alert>

      {template && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Đang lọc theo template: <strong>{template}</strong> · {visibleCategories.length}/{RATE_CATEGORIES.length} hạng mục
        </Typography>
      )}

      <Grid container spacing={2}>
        {visibleCategories.map((cat) => {
          const count = countFor(cat.key);
          return (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={cat.key}>
              <Paper sx={{ p: 2 }} variant="outlined">
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{ fontSize: 32 }}>{cat.icon}</Box>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography fontWeight={700}>{cat.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {count > 0 ? `${count} mục đã lưu` : 'Chưa có dữ liệu'}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => openFor(cat.key, cat.label)}
                  >
                    Mở
                  </Button>
                </Stack>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <HotelModal
        open={modal.kind === 'hotel'}
        onClose={() => setModal({ kind: 'none' })}
        template={template ?? undefined}
      />
      <VisaModal open={modal.kind === 'visa'} onClose={() => setModal({ kind: 'none' })} />
      {modal.kind === 'other' && (
        <RateCardModal
          open
          onClose={() => setModal({ kind: 'none' })}
          type={modal.type}
          label={modal.label}
        />
      )}
    </Box>
  );
}
