import { describe, it, expect } from 'vitest';
import { deriveLocation } from './constants';

describe('deriveLocation', () => {
  it('khớp tên quốc gia trong chuỗi', () => {
    expect(deriveLocation('Tokyo, Nhật Bản')).toEqual({ country: 'Nhật Bản', continent: 'Châu Á' });
  });
  it('khớp thành phố phổ biến → quốc gia + châu lục', () => {
    expect(deriveLocation('Honolulu')).toEqual({ country: 'Mỹ', continent: 'Châu Mỹ' });
    expect(deriveLocation('Bangkok')).toEqual({ country: 'Thái Lan', continent: 'Châu Á' });
    expect(deriveLocation('Sydney Opera House')).toEqual({ country: 'Úc', continent: 'Châu Đại Dương' });
    expect(deriveLocation('Đà Nẵng')).toEqual({ country: 'Việt Nam', continent: 'Châu Á' });
  });
  it('không nhận diện → rỗng', () => {
    expect(deriveLocation('khu vực bí ẩn')).toEqual({});
    expect(deriveLocation('')).toEqual({});
  });
});
