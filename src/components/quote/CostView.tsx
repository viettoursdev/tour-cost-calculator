import { useEffect, useRef, useState } from 'react';
import Sortable from 'sortablejs';
import {
  Box, Button, Menu, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { CatBlock } from './CatBlock';
import { QuoteWarningsBanner } from './QuoteWarningsBanner';
import { StickyTotalsBar } from './StickyTotalsBar';
import { AIQuoteImportDialog } from './AIQuoteImportDialog';
import { GroupSizeTabs } from './GroupSizeTabs';
import { HistPanel } from './HistPanel';
import { CurrencySelector } from './CurrencySelector';
import { DMCComparePanel } from './DMCComparePanel';
import { VisaPickerModal } from './VisaPickerModal';
import { HotelModal } from '@/components/rates/HotelModal';
import { RateCardModal } from '@/components/rates/RateCardModal';
import { computeTotals, fmtVND } from './calc';
import { fmtOutput } from '@/lib/currency';
import { getCATS } from './constants';
import { orderCats, reorderWithinShown } from './catOrder';
import { useQuoteStore } from '@/stores/quoteStore';
import { useAuthStore } from '@/stores/authStore';
import { canEditQuote, canSeePrices } from '@/auth/quotePerms';
import { AiButton } from '@/components/common/AiButton';
import UnfoldMoreOutlinedIcon from '@mui/icons-material/UnfoldMoreOutlined';
import UnfoldLessOutlinedIcon from '@mui/icons-material/UnfoldLessOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import FormatListBulletedOutlinedIcon from '@mui/icons-material/FormatListBulletedOutlined';
import DensitySmallOutlinedIcon from '@mui/icons-material/DensitySmallOutlined';
import DensityMediumOutlinedIcon from '@mui/icons-material/DensityMediumOutlined';
import type { CategoryId, Item, OutputCurrency, Template } from '@/types';

export function CostView() {
  const template = useQuoteStore((s) => s.draft.template) as Template;
  const currentUser = useAuthStore((s) => s.currentUser);
  const readOnly = !canEditQuote(currentUser, template);
  const hidePrice = !canSeePrices(currentUser);
  const items = useQuoteStore((s) => s.draft.items);
  const catEnabled = useQuoteStore((s) => s.draft.catEnabled);
  const pax = useQuoteStore((s) => s.draft.pax);
  const rates = useQuoteStore((s) => s.draft.rates);
  const margin = useQuoteStore((s) => s.draft.margin);
  const vat = useQuoteStore((s) => s.draft.vat);
  const svcBasis = useQuoteStore((s) => s.draft.svcBasis);
  const rounding = useQuoteStore((s) => s.draft.rounding);

  const toggleCat = useQuoteStore((s) => s.toggleCat);
  const addItem = useQuoteStore((s) => s.addItem);
  const addItems = useQuoteStore((s) => s.addItems);
  const reorderItems = useQuoteStore((s) => s.reorderItems);
  const catOrder = useQuoteStore((s) => s.draft.catOrder);
  const setCatOrder = useQuoteStore((s) => s.setCatOrder);
  const updItem = useQuoteStore((s) => s.updItem);
  const delItem = useQuoteStore((s) => s.delItem);

  const outputCurrency = (useQuoteStore((s) => s.draft.outputCurrency) ?? 'USD') as OutputCurrency;
  const dmcPrices = useQuoteStore((s) => s.draft.dmcPrices);
  const dmcMargin = useQuoteStore((s) => s.draft.dmcMargin);
  const setOutputCurrency = useQuoteStore((s) => s.setOutputCurrency);
  const setDmcPrice = useQuoteStore((s) => s.setDmcPrice);
  const setDmcMargin = useQuoteStore((s) => s.setDmcMargin);

  // Rate-card picker (opened from each category's "📋 Rate card" header button).
  const [visaPickerOpen, setVisaPickerOpen] = useState(false);
  const [picker, setPicker] = useState<
    | { kind: 'hotel'; catId: CategoryId }
    | { kind: 'rate'; catId: CategoryId; type: string; label: string }
    | null
  >(null);

  const isDMC = template === 'dmc';

  // Recompute totals on every relevant change. computeTotals reads draft directly,
  // so we pass a shallow projection. (Reading the whole draft via a selector would
  // re-render this component on every keystroke; instead we recompute from slices.)
  const draftSnapshot = { template, info: { name: '', dest: '', days: 1, nights: 0, startDate: null }, pax, rates, margin, vat, svcBasis, rounding, items, catEnabled, currentQuoteId: null };
  const totals = computeTotals(draftSnapshot);

  const cats = orderCats(getCATS(template), catOrder);

  // Gọn hạng mục: điều khiển mở/đóng + ẩn hạng mục đã tắt + nhảy nhanh.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [hideOff, setHideOff] = useState(false);
  const [jumpAnchor, setJumpAnchor] = useState<HTMLElement | null>(null);
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const [density, setDensity] = useState<'comfortable' | 'compact'>(
    () => (typeof localStorage !== 'undefined' && localStorage.getItem('vte_density') === 'compact' ? 'compact' : 'comfortable'),
  );
  const toggleDensity = () => setDensity((d) => {
    const nd = d === 'compact' ? 'comfortable' : 'compact';
    try { localStorage.setItem('vte_density', nd); } catch { /* quota */ }
    return nd;
  });
  const setAllExpanded = (v: boolean) => setExpanded(Object.fromEntries(cats.map((c) => [c.id, v])));
  const jumpTo = (id: string) => {
    setExpanded((m) => ({ ...m, [id]: true }));
    setJumpAnchor(null);
    requestAnimationFrame(() => document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const shownCats = hideOff ? cats.filter((c) => catEnabled[c.id as CategoryId]) : cats;

  // Kéo-thả đổi thứ tự HẠNG MỤC (handle '.cat-drag' trong header CatBlock).
  const catWrapRef = useRef<HTMLDivElement>(null);
  const catCtxRef = useRef({ cats, shownCats, setCatOrder });
  catCtxRef.current = { cats, shownCats, setCatOrder };
  useEffect(() => {
    if (!catWrapRef.current) return;
    const sortable = Sortable.create(catWrapRef.current, {
      handle: '.cat-drag',
      animation: 150,
      onEnd: (e) => {
        const from = e.oldIndex, to = e.newIndex;
        if (from === undefined || to === undefined || from === to) return;
        if (e.item.parentNode) {
          const ref = e.item.parentNode.children[from > to ? from + 1 : from];
          e.item.parentNode.insertBefore(e.item, ref ?? null);
        }
        const ctx = catCtxRef.current;
        ctx.setCatOrder(reorderWithinShown(ctx.cats.map((c) => c.id), ctx.shownCats.map((c) => c.id), from, to) as CategoryId[]);
      },
    });
    return () => sortable.destroy();
  }, []);

  return (
    <Box sx={{ display: 'flex', gap: 2, p: 2 }}>
      <Box sx={{
        flex: 1, minWidth: 0,
        '& tbody td': { fontVariantNumeric: 'tabular-nums' },
        ...(density === 'compact' ? {
          '& .MuiTableCell-root': { paddingTop: '1px', paddingBottom: '1px' },
          '& tbody input, & tbody textarea': { paddingTop: '1px', paddingBottom: '1px' },
        } : null),
      }}>
        {isDMC && (
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.75} flexWrap="wrap" gap={1.25}>
            <Typography fontSize={14} fontWeight={700} color="rgba(15,58,74,0.6)">
              📋 Breakdown chi phí DMC — nhập giá theo từng hạng mục
            </Typography>
            <Stack direction="row" alignItems="center" gap={1.25}>
              <Typography fontSize={12} color="rgba(15,58,74,0.5)">Hiển thị tổng theo:</Typography>
              <CurrencySelector value={outputCurrency} onChange={setOutputCurrency} />
            </Stack>
          </Stack>
        )}

        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.25 }}>
          <Button size="small" variant="outlined" startIcon={<UnfoldMoreOutlinedIcon />} onClick={() => setAllExpanded(true)} sx={{ textTransform: 'none', py: 0.25 }}>Mở tất cả</Button>
          <Button size="small" variant="outlined" startIcon={<UnfoldLessOutlinedIcon />} onClick={() => setAllExpanded(false)} sx={{ textTransform: 'none', py: 0.25 }}>Thu gọn</Button>
          <Button size="small" variant={hideOff ? 'contained' : 'outlined'} startIcon={<VisibilityOffOutlinedIcon />} onClick={() => setHideOff((v) => !v)} sx={{ textTransform: 'none', py: 0.25 }}>
            Ẩn hạng mục đã tắt
          </Button>
          <Button size="small" variant="outlined" startIcon={<FormatListBulletedOutlinedIcon />} onClick={(e) => setJumpAnchor(e.currentTarget)} sx={{ textTransform: 'none', py: 0.25 }}>Nhảy tới…</Button>
          <Button size="small" variant={density === 'compact' ? 'contained' : 'outlined'} startIcon={density === 'compact' ? <DensitySmallOutlinedIcon /> : <DensityMediumOutlinedIcon />} onClick={toggleDensity} sx={{ textTransform: 'none', py: 0.25 }} title="Đổi mật độ hiển thị (lưu theo máy)">
            {density === 'compact' ? 'Gọn' : 'Thoáng'}
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          {!readOnly && (
            <AiButton size="small" onClick={() => setAiImportOpen(true)} title="Tải file báo giá để AI tự phân tích & điền"
              sx={{ py: 0.25 }}>
              Nhập từ file (AI)
            </AiButton>
          )}
          <Menu anchorEl={jumpAnchor} open={!!jumpAnchor} onClose={() => setJumpAnchor(null)}>
            {cats.map((c) => (
              <MenuItem key={c.id} onClick={() => jumpTo(c.id)} sx={{ fontSize: 13, gap: 1 }}>
                <span>{c.icon}</span> {c.label}
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 'auto', pl: 2 }}>
                  {(items[c.id as CategoryId]?.length ?? 0)} dòng
                </Typography>
              </MenuItem>
            ))}
          </Menu>
        </Stack>

        {readOnly && (
          <Paper variant="outlined" sx={{ mb: 1.5, p: 1.25, borderRadius: 2, borderColor: 'rgba(245,166,35,0.6)', background: 'rgba(245,166,35,0.08)' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#b9770f' }}>
              🔒 Chỉ xem — phòng của bạn không được sửa báo giá {template === 'domestic' ? 'nội địa' : 'quốc tế/DMC'} này.
            </Typography>
          </Paper>
        )}

        {!hidePrice && (
          <QuoteWarningsBanner
            cats={cats}
            items={items}
            catEnabled={catEnabled}
            rates={rates}
            pricing={isDMC ? undefined : { totalCost: totals.totalCost, totalProfit: totals.totalProfit, grandTotal: totals.grandTotal }}
          />
        )}

        <GroupSizeTabs />

        <Box ref={catWrapRef}>
        {shownCats.map((cat) => {
          const catId = cat.id as CategoryId;
          let onOpenRate: (() => void) | undefined;
          if (cat.id === 'visa') onOpenRate = () => setVisaPickerOpen(true);
          else if (cat.id === 'hotel') onOpenRate = () => setPicker({ kind: 'hotel', catId: 'hotel' });
          // Rate card "tham quan" chỉ cho tour quốc tế & nội địa (không hiện ở DMC).
          else if (cat.rateCard && !(cat.rateCard === 'sight' && template === 'dmc')) {
            const type = cat.rateCard;
            const label = cat.label;
            onOpenRate = () => setPicker({ kind: 'rate', catId, type, label });
          }
          return (
            <Box key={cat.id} className="cat-item">
            <CatBlock
              cat={cat}
              domId={`cat-${cat.id}`}
              expanded={expanded[cat.id] ?? !!catEnabled[catId]}
              onExpandedChange={(v) => setExpanded((m) => ({ ...m, [cat.id]: v }))}
              readOnly={readOnly}
              hidePrice={hidePrice}
              items={items[catId] ?? []}
              enabled={catEnabled[catId]}
              pax={pax}
              rates={rates}
              onToggleCat={() => toggleCat(catId)}
              onUpd={(it) => updItem(catId, it)}
              onAdd={() => addItem(catId)}
              onDel={(id) => delItem(catId, id)}
              onDup={(it) => { const { id, ...rest } = it; void id; addItem(catId, rest); }}
              onAddMany={(rows) => addItems(catId, rows)}
              onReorder={(from, to) => reorderItems(catId, from, to)}
              onOpenRate={onOpenRate}
              displayCurrency={isDMC ? outputCurrency : undefined}
            />
            </Box>
          );
        })}
        </Box>

        <VisaPickerModal
          open={visaPickerOpen}
          onClose={() => setVisaPickerOpen(false)}
          onPick={(lines: Partial<Item>[]) => lines.forEach((l) => addItem('visa', l))}
        />

        {picker?.kind === 'hotel' && (
          <HotelModal
            open
            pax={pax}
            template={template}
            onClose={() => setPicker(null)}
            onPick={(line) => { addItem(picker.catId, line); setPicker(null); }}
          />
        )}

        {picker?.kind === 'rate' && (
          <RateCardModal
            open
            type={picker.type}
            label={picker.label}
            onClose={() => setPicker(null)}
            onPick={(line) => { addItem(picker.catId, line); setPicker(null); }}
          />
        )}

        {!hidePrice && isDMC && dmcMargin !== undefined && (() => {
          const marginVND = dmcMargin.type === 'percent'
            ? Math.round(totals.totalCost * (dmcMargin.value || 0) / 100)
            : Math.round((dmcMargin.value || 0) * (outputCurrency !== 'VND' && rates[outputCurrency] ? rates[outputCurrency] : 1));
          const totalWithMarginVND = totals.totalCost + marginVND;
          return (
            <Paper
              variant="outlined"
              sx={{ borderColor: 'rgba(15,58,74,0.25)', borderRadius: 1.5, p: 1.75, mt: 1.25 }}
            >
              <Stack direction="row" alignItems="center" gap={1.75} flexWrap="wrap">
                <Typography fontWeight={700} fontSize={14} color="#0f3a4a" sx={{ flex: 1, minWidth: 180 }}>
                  💼 Profit Margin & Service Charge
                </Typography>
                <Stack direction="row" gap={0.75}>
                  {([
                    { v: 'percent' as const, l: '% tổng chi phí' },
                    { v: 'fixed'   as const, l: 'Số tiền cố định' },
                  ]).map((opt) => (
                    <Button
                      key={opt.v}
                      size="small"
                      onClick={() => setDmcMargin({ type: opt.v, value: 0 })}
                      sx={{
                        px: 1.5, py: 0.5, borderRadius: 1, fontSize: 12, fontWeight: 600, textTransform: 'none',
                        background: dmcMargin.type === opt.v ? '#0f3a4a' : 'rgba(15,58,74,0.08)',
                        color: dmcMargin.type === opt.v ? '#fff' : '#0f3a4a',
                        border: '1.5px solid rgba(15,58,74,0.3)',
                        '&:hover': {
                          background: dmcMargin.type === opt.v ? '#0a2a38' : 'rgba(15,58,74,0.15)',
                        },
                      }}
                    >
                      {opt.l}
                    </Button>
                  ))}
                </Stack>
                <Stack direction="row" alignItems="center" gap={0.75}>
                  <TextField
                    type="number"
                    size="small"
                    value={dmcMargin.value || ''}
                    onChange={(e) => setDmcMargin({ value: +e.target.value })}
                    slotProps={{ htmlInput: { min: 0, step: dmcMargin.type === 'percent' ? 0.5 : 1, style: { textAlign: 'right', width: 80, fontWeight: 700, color: '#0f3a4a' } } }}
                    placeholder="0"
                  />
                  <Typography fontSize={13} color="#0f3a4a" fontWeight={700}>
                    {dmcMargin.type === 'percent' ? '%' : outputCurrency}
                  </Typography>
                </Stack>
                <Box sx={{ textAlign: 'right', minWidth: 140 }}>
                  <Typography fontSize={12} color="rgba(15,58,74,0.5)">
                    Margin:{' '}
                    <Typography component="strong" color="#0f3a4a">
                      {fmtOutput(marginVND, outputCurrency, rates)}
                    </Typography>
                  </Typography>
                  <Typography fontSize={13} fontWeight={800} color="#0f3a4a" mt={0.25}>
                    Tổng + margin:{' '}
                    <Typography component="span" color="#0f3a4a">
                      {fmtOutput(totalWithMarginVND, outputCurrency, rates)}
                    </Typography>
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          );
        })()}

        {!hidePrice && isDMC && dmcPrices && dmcMargin && (() => {
          const marginVND = dmcMargin.type === 'percent'
            ? Math.round(totals.totalCost * (dmcMargin.value || 0) / 100)
            : Math.round((dmcMargin.value || 0) * (outputCurrency !== 'VND' && rates[outputCurrency] ? rates[outputCurrency] : 1));
          return (
            <DMCComparePanel
              totalCostVND={totals.totalCost + marginVND}
              pax={pax}
              rates={rates}
              outputCurrency={outputCurrency}
              dmcPrices={dmcPrices}
              setDmcPrice={setDmcPrice}
              breakdownTotalVNDAt={(gs) => {
                // Recompute the breakdown cost AT this group size (per-pax items
                // scale with pax), then add the DMC margin.
                const t = computeTotals({ ...draftSnapshot, pax: gs });
                const m = dmcMargin.type === 'percent'
                  ? Math.round(t.totalCost * (dmcMargin.value || 0) / 100)
                  : Math.round((dmcMargin.value || 0) * (outputCurrency !== 'VND' && rates[outputCurrency] ? rates[outputCurrency] : 1));
                return t.totalCost + m;
              }}
            />
          );
        })()}

        {!hidePrice && isDMC && (
          <Paper
            variant="outlined"
            sx={{ borderRadius: 2, p: 2.5, mt: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}
          >
            <Typography color="rgba(15,58,74,0.55)" fontSize={13}>
              {Object.values(items).reduce((s, arr) => s + (arr?.length ?? 0), 0)} dòng · Tổng: {fmtOutput(totals.totalCost, outputCurrency, rates)}
            </Typography>
            <Box sx={{ textAlign: 'right' }}>
              <Typography color="rgba(15,58,74,0.5)" fontSize={12}>Tổng chi phí gốc cả đoàn</Typography>
              <Typography color="#0d7a6a" fontWeight={800} fontSize={22}>
                {fmtVND(totals.totalCost)}
              </Typography>
            </Box>
          </Paper>
        )}

        <AIQuoteImportDialog open={aiImportOpen} onClose={() => setAiImportOpen(false)} />

        {!hidePrice && !isDMC && <StickyTotalsBar totals={totals} pax={pax} />}

        {!isDMC && <HistPanel />}
      </Box>
    </Box>
  );
}
