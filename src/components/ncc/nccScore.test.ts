import { describe, it, expect } from 'vitest';
import { nccScore, suggestNcc } from './nccScore';
import type { Ncc, NccRating } from '@/types';

const NOW = Date.parse('2026-06-01');
const monthsAgo = (m: number) => new Date(NOW - m * 30 * 86_400_000).toISOString();
const rating = (stars: number, at = monthsAgo(1)): NccRating =>
  ({ id: Math.random().toString(36), by: 'u', byName: 'U', at, stars, comment: '' });

const ncc = (p: Partial<Ncc>): Ncc =>
  ({
    id: 'n', name: 'NCC', sectors: [], location: '', contacts: [], note: '',
    createdAt: monthsAgo(12), createdBy: 'u', ...p,
  }) as Ncc;

describe('nccScore', () => {
  it('NCC nhiều sao + nhiều tour + lâu năm → điểm cao, band tốt', () => {
    const s = nccScore(ncc({
      ratings: [rating(5), rating(5), rating(4), rating(5)],
      tours: Array(8).fill('t'),
      createdAt: monthsAgo(30),
    }), { now: NOW });
    expect(s.score).toBeGreaterThanOrEqual(70);
    expect(s.band).toBe('tốt');
    expect(s.avgStars).toBeCloseTo(4.75);
  });

  it('NCC sao thấp + hạn chế hợp tác → điểm thấp, band yếu', () => {
    const s = nccScore(ncc({ ratings: [rating(1), rating(2)], status: 'restricted' }), { now: NOW });
    expect(s.score).toBeLessThan(40);
    expect(s.band).toBe('yếu');
  });

  it('không có đánh giá → quanh nền, không có avgStars', () => {
    const s = nccScore(ncc({ tours: [] }), { now: NOW });
    expect(s.avgStars).toBeUndefined();
    expect(s.ratingCount).toBe(0);
    expect(s.score).toBeGreaterThanOrEqual(40);
    expect(s.score).toBeLessThanOrEqual(70);
  });

  it('tạm dừng bị trừ điểm', () => {
    const base = nccScore(ncc({ ratings: [rating(4)] }), { now: NOW }).score;
    const paused = nccScore(ncc({ ratings: [rating(4)], status: 'paused' }), { now: NOW }).score;
    expect(paused).toBeLessThan(base);
  });
});

describe('suggestNcc', () => {
  const list: Ncc[] = [
    ncc({ id: '1', name: 'KS Đà Nẵng tốt', sectors: ['Khách sạn'], location: 'Đà Nẵng', ratings: [rating(5), rating(5)] }),
    ncc({ id: '2', name: 'KS Đà Nẵng thường', sectors: ['Khách sạn'], location: 'Đà Nẵng', ratings: [rating(3)] }),
    ncc({ id: '3', name: 'KS Hà Nội', sectors: ['Khách sạn'], location: 'Hà Nội', ratings: [rating(5)] }),
    ncc({ id: '4', name: 'Nhà hàng ĐN', sectors: ['Nhà hàng'], location: 'Đà Nẵng', ratings: [rating(5)] }),
    ncc({ id: '5', name: 'KS ĐN cấm', sectors: ['Khách sạn'], location: 'Đà Nẵng', status: 'restricted', ratings: [rating(5)] }),
  ];

  it('lọc theo lĩnh vực + địa điểm, xếp theo điểm, loại NCC hạn chế', () => {
    const r = suggestNcc(list, { sector: 'khách sạn', location: 'đà nẵng' }, { now: NOW });
    expect(r.map((x) => x.ncc.id)).toEqual(['1', '2']); // không có 3(HN)/4(nhà hàng)/5(restricted)
    expect(r[0].score.score).toBeGreaterThanOrEqual(r[1].score.score);
  });

  it('khớp không dấu', () => {
    const r = suggestNcc(list, { sector: 'khach san', location: 'da nang' }, { now: NOW });
    expect(r.length).toBe(2);
  });

  it('không lọc địa điểm → mọi NCC cùng lĩnh vực', () => {
    const r = suggestNcc(list, { sector: 'Khách sạn' }, { now: NOW });
    expect(r.map((x) => x.ncc.id).sort()).toEqual(['1', '2', '3']);
  });
});
