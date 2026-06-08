import type { OutputCurrency } from '@/types';

// Source: public/legacy.html:3667
export const DMC_CURRENCIES: OutputCurrency[] =
  ['USD', 'VND', 'EUR', 'JPY', 'SGD', 'KRW', 'THB', 'GBP', 'AUD', 'CNY'];

export const CURRENCY_FLAGS: Record<OutputCurrency, string> = {
  VND: '🇻🇳', USD: '🇺🇸', EUR: '🇪🇺', JPY: '🇯🇵', KRW: '🇰🇷',
  SGD: '🇸🇬', THB: '🇹🇭', GBP: '🇬🇧', AUD: '🇦🇺', CNY: '🇨🇳',
};

// Source: public/legacy.html:3694-3697
// VND or missing rate → identity.
export function toOutputCurrency(
  vnd: number,
  cur: OutputCurrency,
  rates: Record<string, number>,
): number {
  if (cur === 'VND' || !rates[cur]) return vnd;
  return vnd / rates[cur];
}

// Source: public/legacy.html:3698-3702
// VND      → "1.234.567 ₫"     (vi-VN locale)
// JPY/KRW  → "1,234,567 JPY"   (no decimals, en-US grouping)
// else     → "1,234.56 USD"    (2 decimals, US grouping via regex)
export function fmtCurrency(amount: number, cur: OutputCurrency): string {
  if (cur === 'VND') return Math.round(amount).toLocaleString('vi-VN') + ' ₫';
  if (cur === 'JPY' || cur === 'KRW') {
    return Math.round(amount).toLocaleString('en-US') + ' ' + cur;
  }
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' ' + cur;
}

// Rate-guarded display helper. Returns "—" when the chosen non-VND currency
// has no exchange rate set, so we never render VND amounts as USD/EUR/etc.
export function fmtOutput(
  vnd: number,
  cur: OutputCurrency,
  rates: Record<string, number>,
): string {
  if (cur !== 'VND' && !rates[cur]) return '—';
  return fmtCurrency(toOutputCurrency(vnd, cur, rates), cur);
}
