import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));
import { rateCardSuggestions } from './rateCardSuggest';
import { useRateCardStore } from '@/stores/rateCardStore';
import type { RateCard } from '@/types';

describe('rateCardSuggestions', () => {
  it('trích từ khách sạn (option đầu có giá) + bảng giá khác (min/max → trung bình)', () => {
    const rates = {
      hotels: {
          danang: [
            { name: 'Mường Thanh', options: [{ label: 'Standard', price: 1200000 }] },
            { name: 'Không giá', options: [{ label: 'x', price: 0 }] }, // bỏ
            { name: '', options: [{ label: 'y', price: 999 }] },        // không tên → bỏ
          ],
        },
        visaRates: {},
        otherRates: {
          guide: [
            { label: 'HDV tiếng Anh', min: 1000000, max: 1400000, unit: '/ngày' },
            { name: 'Vé tham quan', price: 200000 },
            { label: 'Thiếu giá' },                                     // bỏ
          ],
        },
    };
    useRateCardStore.setState({ rates: rates as unknown as RateCard });
    const s = rateCardSuggestions();
    const byName = Object.fromEntries(s.map((x) => [x.name, x]));
    expect(byName['Mường Thanh']).toMatchObject({ price: 1200000, unit: '/phòng/đêm', cur: 'VND' });
    expect(byName['HDV tiếng Anh']).toMatchObject({ price: 1200000, unit: '/ngày' });
    expect(byName['Vé tham quan']).toMatchObject({ price: 200000 });
    expect(byName['Không giá']).toBeUndefined();
    expect(byName['Thiếu giá']).toBeUndefined();
  });
});
