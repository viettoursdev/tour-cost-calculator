import { describe, it, expect } from 'vitest';
import { contractIssues } from './contractValidation';
import type { Contract } from '@/types';

const full: Contract = {
  id: 'c1', contractNo: 'HD-001', contractDate: '2026-06-01', contractStatus: 'draft',
  tourName: 'Đà Nẵng 3N2Đ', tourDest: 'Đà Nẵng', tourDays: 3, tourNights: 2,
  tourStartDate: '2026-07-01', departure: 'Hà Nội', contractPax: 20, pricePerPax: 5000000,
  partyB: { name: 'Công ty A', address: '123 Phố X', tel: '0900', rep: 'Ông B', title: 'GĐ', taxCode: '0101', email: 'a@a.vn' },
  includes: [], excludes: [],
  payments: [{ id: 'p1', label: 'Đợt 1', amount: 1000000, dueDate: '2026-06-15', note: '', status: 'pending' }],
  cancels: [], bondPercent: 0, hasAcceptance: false, createdAt: '', createdBy: 'me',
} as Contract;

describe('contractIssues', () => {
  it('hồ sơ đủ → không cảnh báo', () => {
    expect(contractIssues(full)).toEqual([]);
  });
  it('bắt thiếu thông tin Bên B + ngày + thanh toán', () => {
    const bad = { ...full, partyB: { ...full.partyB, name: '', taxCode: '' }, tourStartDate: '', payments: [] } as Contract;
    const w = contractIssues(bad);
    expect(w).toContain('Thiếu tên Bên B');
    expect(w).toContain('Thiếu mã số thuế Bên B');
    expect(w).toContain('Chưa có ngày khởi hành');
    expect(w).toContain('Chưa có điều khoản thanh toán');
  });
  it('bắt giá/khách = 0', () => {
    expect(contractIssues({ ...full, contractPax: 0, pricePerPax: 0 } as Contract))
      .toEqual(expect.arrayContaining(['Số khách = 0', 'Đơn giá/khách = 0']));
  });
});
