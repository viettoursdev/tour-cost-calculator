import type { PriceMod, QuotePricingOptions } from '@/types';

export const DEFAULT_PRICING_OPTIONS: QuotePricingOptions = {
  singleSupp: { enabled: false, mode: 'fixed', value: 0 },
  infant: { enabled: false, mode: 'percent', value: 0 },
  child: { enabled: false, mode: 'percent', value: 75 },
  tips: { enabled: false, mode: 'fixed', value: 0 },
  extras: [],
};

/** Resolve a price modifier to a VND amount given the adult package price/pax. */
export function resolveMod(mod: { mode: 'percent' | 'fixed'; value: number }, adultPPax: number): number {
  return mod.mode === 'percent' ? Math.round((adultPPax * (mod.value || 0)) / 100) : Math.round(mod.value || 0);
}

export type PricingLine = { key: string; label: string; resolved: number; detail: string };

/** Build the list of enabled pricing add-ons resolved against the adult price. */
export function pricingLines(opts: QuotePricingOptions | undefined, adultPPax: number): PricingLine[] {
  if (!opts) return [];
  const out: PricingLine[] = [];
  const push = (key: string, label: string, mod: PriceMod) => {
    if (!mod.enabled) return;
    const resolved = resolveMod(mod, adultPPax);
    const detail = mod.mode === 'percent' ? `${mod.value}% giá NL` : 'cố định';
    out.push({ key, label, resolved, detail });
  };
  push('singleSupp', 'Phụ thu phòng đơn', opts.singleSupp);
  push('infant', 'Trẻ em dưới 2 tuổi', opts.infant);
  push('child', 'Trẻ em 2–12 tuổi', opts.child);
  push('tips', 'Tips / khách', opts.tips);
  opts.extras.forEach((e) => {
    const resolved = resolveMod(e, adultPPax);
    const detail = e.mode === 'percent' ? `${e.value}% giá NL` : 'cố định';
    out.push({ key: e.id, label: e.label || 'Khoản khác', resolved, detail });
  });
  return out;
}
