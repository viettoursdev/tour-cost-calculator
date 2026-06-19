import { describe, it, expect } from 'vitest';
import { quoteAreaForTemplate, canEditQuote, canSeePrices } from './quotePerms';
import type { User } from '@/types';

const u = (over: Partial<User>): User => ({ u: 'x', role: 'Operations', name: 'X', color: '#000', ...over });

describe('quoteAreaForTemplate', () => {
  it('map template → khu vực', () => {
    expect(quoteAreaForTemplate('domestic')).toBe('quote_domestic');
    expect(quoteAreaForTemplate('intl')).toBe('quote_intl');
    expect(quoteAreaForTemplate('dmc')).toBe('quote_intl');
    expect(quoteAreaForTemplate('itinerary')).toBeNull();
  });
});

describe('canEditQuote', () => {
  it('ĐH nội địa: sửa nội địa, KHÔNG sửa quốc tế', () => {
    const op = u({ department: 'dh_noidia' });
    expect(canEditQuote(op, 'domestic')).toBe(true);
    expect(canEditQuote(op, 'intl')).toBe(false);
  });
  it('ĐH nước ngoài: sửa quốc tế/DMC, KHÔNG sửa nội địa', () => {
    const op = u({ department: 'dh_nuocngoai' });
    expect(canEditQuote(op, 'intl')).toBe(true);
    expect(canEditQuote(op, 'dmc')).toBe(true);
    expect(canEditQuote(op, 'domestic')).toBe(false);
  });
  it('chưa gán phòng / CEO → sửa mọi template', () => {
    expect(canEditQuote(u({ department: undefined }), 'intl')).toBe(true);
    expect(canEditQuote(u({ role: 'CEO', department: 'visa' }), 'domestic')).toBe(true);
  });
  it('alt template (itinerary) → luôn cho sửa', () => {
    expect(canEditQuote(u({ department: 'ketoan' }), 'itinerary')).toBe(true);
  });
});

describe('canSeePrices', () => {
  it('HDV bị ẩn giá; còn lại thấy', () => {
    expect(canSeePrices(u({ department: 'hdv' }))).toBe(false);
    expect(canSeePrices(u({ department: 'dh_noidia' }))).toBe(true);
    expect(canSeePrices(u({ department: undefined }))).toBe(true);
    expect(canSeePrices(null)).toBe(true);
  });
});
