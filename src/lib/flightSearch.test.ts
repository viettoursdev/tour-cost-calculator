import { describe, it, expect } from 'vitest';
import {
  normalizeOption, normalizeResult, tagBest, sortOptions,
  flightSearchToQuoteFlight, fmtDuration, layoverIsWarn,
  type FlightOption,
} from './flightSearch';

const rawOpt = (over: Record<string, unknown> = {}) => ({
  airlines: ['Vietnam Airlines'],
  totalDurationMin: '545',
  legs: [
    { flightNo: 'vn310', airline: 'Vietnam Airlines', depAirport: 'han', depTime: '00:30', depDate: '20nov', arrAirport: 'nrt', arrTime: '07:15', durationMin: 345 },
  ],
  layovers: [],
  priceVnd: '8500000',
  bookingSources: [{ name: 'Google Flights', url: 'https://x' }],
  tags: [],
  ...over,
});

describe('normalizeOption', () => {
  it('ép kiểu số, viết hoa IATA/số hiệu, suy stops từ số chặng', () => {
    const o = normalizeOption(rawOpt());
    expect(o.totalDurationMin).toBe(545);
    expect(o.priceVnd).toBe(8500000);
    expect(o.legs[0].flightNo).toBe('VN310');
    expect(o.legs[0].depAirport).toBe('HAN');
    expect(o.stops).toBe(0); // 1 chặng → 0 điểm dừng
    expect(o.id).toBeTruthy();
  });

  it('suy stops = legs-1 khi có nhiều chặng và thiếu stops', () => {
    const o = normalizeOption(rawOpt({
      stops: undefined,
      legs: [
        { flightNo: 'VN1', depAirport: 'HAN', arrAirport: 'SIN' },
        { flightNo: 'VN2', depAirport: 'SIN', arrAirport: 'SYD' },
      ],
    }));
    expect(o.stops).toBe(1);
  });

  it('lọc bỏ bookingSources rỗng', () => {
    const o = normalizeOption(rawOpt({ bookingSources: [{ name: '', url: '' }, { name: 'Kayak' }] }));
    expect(o.bookingSources).toHaveLength(1);
    expect(o.bookingSources[0].name).toBe('Kayak');
  });
});

describe('tagBest', () => {
  it('gắn cheapest/fastest/nonstop đúng option', () => {
    const opts = [
      normalizeOption(rawOpt({ priceVnd: 9000000, totalDurationMin: 400, legs: [{ depAirport: 'HAN', arrAirport: 'NRT' }] })),
      normalizeOption(rawOpt({ priceVnd: 7000000, totalDurationMin: 600, stops: 1 })),
    ];
    const tagged = tagBest(opts);
    expect(tagged[1].tags).toContain('cheapest'); // 7tr rẻ hơn
    expect(tagged[0].tags).toContain('fastest');  // 400p nhanh hơn
    expect(tagged[0].tags).toContain('nonstop');  // 0 stop
    expect(tagged[1].tags).not.toContain('nonstop');
  });

  it('không lỗi khi danh sách rỗng', () => {
    expect(tagBest([])).toEqual([]);
  });
});

describe('sortOptions', () => {
  const a = normalizeOption(rawOpt({ priceVnd: 9000000, totalDurationMin: 400 }));
  const b = normalizeOption(rawOpt({ priceVnd: 7000000, totalDurationMin: 600 }));
  const opts = [a, b];

  it('cheapest xếp giá tăng dần', () => {
    expect(sortOptions(opts, 'cheapest')[0].priceVnd).toBe(7000000);
  });
  it('fastest xếp thời gian tăng dần', () => {
    expect(sortOptions(opts, 'fastest')[0].totalDurationMin).toBe(400);
  });
  it('không đột biến mảng gốc', () => {
    sortOptions(opts, 'cheapest');
    expect(opts[0]).toBe(a);
  });
  it('option thiếu giá bị đẩy xuống cuối khi cheapest', () => {
    const noPrice = normalizeOption(rawOpt({ priceVnd: undefined }));
    const sorted = sortOptions([noPrice, b], 'cheapest');
    expect(sorted[sorted.length - 1]).toBe(noPrice);
  });
});

describe('normalizeResult', () => {
  it('bọc options + tag + giữ citations/warning', () => {
    const r = normalizeResult({
      options: [rawOpt(), rawOpt({ priceVnd: 5000000 })],
      citations: [{ url: 'https://a', title: 'A' }],
      generatedAt: '2026-07-02T00:00:00Z',
      warning: 'x',
    });
    expect(r.options).toHaveLength(2);
    expect(r.citations).toHaveLength(1);
    expect(r.warning).toBe('x');
    // option 5tr được gắn cheapest
    expect(r.options.some((o) => o.tags.includes('cheapest'))).toBe(true);
  });

  it('options không phải mảng → rỗng', () => {
    expect(normalizeResult({ options: undefined }).options).toEqual([]);
  });
});

describe('flightSearchToQuoteFlight', () => {
  it('map leg→segment giữ IATA/ngày/giờ, giá VND→fare', () => {
    const o = normalizeOption(rawOpt());
    const f = flightSearchToQuoteFlight(o);
    expect(f.segments).toHaveLength(1);
    expect(f.segments[0].depAirport).toBe('HAN');
    expect(f.segments[0].date).toBe('20NOV');
    expect(f.segments[0].flightNo).toBe('VN310');
    expect(f.segments[0].airlineName).toBe('Vietnam Airlines');
    expect(f.fares[0].cur).toBe('VND');
    expect(f.fares[0].amount).toBe(8500000);
    expect(f.note).toContain('tham khảo');
  });

  it('dùng giá gốc ngoại tệ khi có priceCur ≠ VND', () => {
    const o = normalizeOption(rawOpt({ priceOrig: 350, priceCur: 'usd', priceVnd: 8500000 }));
    const f = flightSearchToQuoteFlight(o);
    expect(f.fares[0].cur).toBe('USD');
    expect(f.fares[0].amount).toBe(350);
  });

  it('option không có leg vẫn tạo 1 segment trống', () => {
    const o: FlightOption = { ...normalizeOption(rawOpt()), legs: [] };
    const f = flightSearchToQuoteFlight(o);
    expect(f.segments).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('fmtDuration', () => {
    expect(fmtDuration(545)).toBe('9h 5m');
    expect(fmtDuration(120)).toBe('2h');
    expect(fmtDuration(45)).toBe('45m');
    expect(fmtDuration(undefined)).toBe('—');
    expect(fmtDuration(0)).toBe('—');
  });
  it('layoverIsWarn: chờ >3h / qua đêm / đổi sân bay', () => {
    expect(layoverIsWarn({ airport: 'DOH', durationMin: 200 })).toBe(true);
    expect(layoverIsWarn({ airport: 'DOH', durationMin: 90 })).toBe(false);
    expect(layoverIsWarn({ airport: 'DOH', durationMin: 90, overnight: true })).toBe(true);
    expect(layoverIsWarn({ airport: 'DOH', durationMin: 90, changeAirport: true })).toBe(true);
  });
});
