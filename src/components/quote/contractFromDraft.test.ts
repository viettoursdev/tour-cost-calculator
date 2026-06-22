import { describe, it, expect } from 'vitest';
import { buildContractFromQuote, customerToPartyB, type QuoteContractCtx } from './contractFromDraft';
import { emptyContract } from '../contract/constants';
import type { Customer } from '@/types';

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'kh1',
  name: 'Công ty ABC',
  type: 'company',
  address: '12 Lê Lợi, Q1',
  taxCode: '0312345678',
  contacts: [{ name: 'Nguyễn Văn A', phone: '0901', email: 'a@abc.vn', position: 'Trưởng phòng HC' }],
  note: '',
  createdAt: '2026-06-01T00:00:00.000Z',
  createdBy: 'Sale A',
  ...over,
});

const ctx = (over: Partial<QuoteContractCtx> = {}): QuoteContractCtx => ({
  quoteId: 'q-cloud-1',
  name: 'Tour Nhật Bản 5N4Đ',
  dest: 'Nhật Bản',
  days: 5,
  nights: 4,
  pax: 20,
  pricePerPax: 25_000_000,
  startDateISO: '2026-09-01T00:00:00.000Z',
  ...over,
});

describe('customerToPartyB', () => {
  it('lấy liên hệ đầu làm đại diện, fallback chức vụ "Giám đốc"', () => {
    expect(customerToPartyB(customer())).toEqual({
      name: 'Công ty ABC',
      address: '12 Lê Lợi, Q1',
      taxCode: '0312345678',
      rep: 'Nguyễn Văn A',
      title: 'Trưởng phòng HC',
      tel: '0901',
      email: 'a@abc.vn',
    });
  });
  it('không có liên hệ → rỗng + title mặc định', () => {
    const p = customerToPartyB(customer({ contacts: [] }));
    expect(p.rep).toBe('');
    expect(p.title).toBe('Giám đốc');
  });
});

describe('buildContractFromQuote', () => {
  it('prefill thông tin tour + giá + ngày khởi hành (ISO → yyyy-mm-dd)', () => {
    const c = buildContractFromQuote(emptyContract('Sale A'), ctx());
    expect(c.tourName).toBe('Tour Nhật Bản 5N4Đ');
    expect(c.tourDest).toBe('Nhật Bản');
    expect(c.tourDays).toBe(5);
    expect(c.contractPax).toBe(20);
    expect(c.pricePerPax).toBe(25_000_000);
    expect(c.tourStartDate).toBe('2026-09-01');
  });

  it('THIẾT LẬP liên kết 2 chiều', () => {
    const c = buildContractFromQuote(emptyContract('Sale A'), ctx());
    expect(c.linkedQuoteId).toBe('q-cloud-1');
    expect(c.linkedQuoteName).toBe('Tour Nhật Bản 5N4Đ');
  });

  it('quoteId null → linkedQuoteId null (không phá kiểu)', () => {
    const c = buildContractFromQuote(emptyContract('Sale A'), ctx({ quoteId: null }));
    expect(c.linkedQuoteId).toBeNull();
  });

  it('điền Bên B từ khách khi có', () => {
    const c = buildContractFromQuote(emptyContract('Sale A'), ctx({ customer: customer() }));
    expect(c.partyB.name).toBe('Công ty ABC');
    expect(c.partyB.taxCode).toBe('0312345678');
  });

  it('không có khách → giữ Bên B rỗng của emptyContract', () => {
    const c = buildContractFromQuote(emptyContract('Sale A'), ctx());
    expect(c.partyB.name).toBe('');
  });

  it('giữ điều khoản mặc định (includes/cancels) khi báo giá không có', () => {
    const base = emptyContract('Sale A');
    const c = buildContractFromQuote(base, ctx());
    expect(c.includes).toEqual(base.includes);
    expect(c.cancels).toEqual(base.cancels);
  });

  it('lọc dòng includes/excludes rỗng từ báo giá', () => {
    const c = buildContractFromQuote(emptyContract('Sale A'), ctx({ inclusions: ['Vé máy bay', '  ', ''], exclusions: ['Tip'] }));
    expect(c.includes).toEqual(['Vé máy bay']);
    expect(c.excludes).toEqual(['Tip']);
  });

  it('map lịch thanh toán báo giá → ContractPayment pending, dueDate rỗng', () => {
    const c = buildContractFromQuote(emptyContract('Sale A'), ctx({
      payments: [{ id: 'p1', label: 'Cọc 50%', amount: 250_000_000, note: 'Khi ký' }],
    }));
    expect(c.payments).toHaveLength(1);
    expect(c.payments[0]).toMatchObject({ id: 'p1', label: 'Cọc 50%', amount: 250_000_000, status: 'pending', dueDate: '', note: 'Khi ký' });
  });
});
