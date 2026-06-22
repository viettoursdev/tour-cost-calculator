import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { checkContractDeadlines } from './notifications';
import * as sb from '@/lib/supabase';
import type { User } from '@/types';

const user: User = { u: 'ceo', p: 'x', role: 'CEO', name: 'Tony', color: '#dc3250' };

function ddmmyyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function makeContract(payments: { id: string; label: string; amount: number; dueDate: string; status: 'pending' | 'paid'; note?: string }[]) {
  return {
    id: 'c1',
    contractNo: 'HD-001',
    tourName: 'Test Tour',
    customerName: 'A',
    contractDate: '2025-01-01',
    contractStatus: 'active' as const,
    tourDest: 'HN',
    tourDays: 3,
    tourNights: 2,
    departure: 'HCM',
    contractPax: 10,
    pricePerPax: 1_000_000,
    partyB: { name: '', address: '', tel: '', rep: '', title: '', taxCode: '', email: '' },
    includes: [],
    excludes: [],
    payments: payments.map(p => ({ note: '', ...p })),
    cancels: [],
    bondPercent: 30,
    hasAcceptance: false,
    createdAt: '2025-01-01T00:00:00Z',
    createdBy: 'ceo',
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('checkContractDeadlines', () => {
  it('sends a reminder for payments due within 7 days', async () => {
    const today = new Date();
    const in3days = new Date(today.getTime() + 3 * 86400000);
    vi.mocked(sb.sbGetContracts).mockResolvedValueOnce([
      makeContract([{
        id: 'p1',
        label: 'Đặt cọc',
        amount: 5_000_000,
        dueDate: ddmmyyyy(in3days),
        status: 'pending',
      }]),
    ]);
    await checkContractDeadlines(user);
    expect(sb.sbSendNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sb.sbSendNotification).mock.calls[0][0]).toBe('ceo');
    const payload = vi.mocked(sb.sbSendNotification).mock.calls[0][1];
    expect(payload.type).toBe('payment_due');
    expect(payload.data).toMatchObject({ contractId: 'c1', paymentId: 'p1' });
  });

  it('does NOT send for payments due more than 7 days out', async () => {
    const today = new Date();
    const in20days = new Date(today.getTime() + 20 * 86400000);
    vi.mocked(sb.sbGetContracts).mockResolvedValueOnce([
      makeContract([{
        id: 'p1',
        label: 'X',
        amount: 100,
        dueDate: ddmmyyyy(in20days),
        status: 'pending',
      }]),
    ]);
    await checkContractDeadlines(user);
    expect(sb.sbSendNotification).not.toHaveBeenCalled();
  });

  it('does NOT send for past-due payments (due < today)', async () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    vi.mocked(sb.sbGetContracts).mockResolvedValueOnce([
      makeContract([{
        id: 'p1',
        label: 'X',
        amount: 100,
        dueDate: ddmmyyyy(yesterday),
        status: 'pending',
      }]),
    ]);
    await checkContractDeadlines(user);
    expect(sb.sbSendNotification).not.toHaveBeenCalled();
  });

  it('does NOT send for non-pending payments', async () => {
    const today = new Date();
    const in3days = new Date(today.getTime() + 3 * 86400000);
    vi.mocked(sb.sbGetContracts).mockResolvedValueOnce([
      makeContract([{
        id: 'p1',
        label: 'X',
        amount: 100,
        dueDate: ddmmyyyy(in3days),
        status: 'paid',
      }]),
    ]);
    await checkContractDeadlines(user);
    expect(sb.sbSendNotification).not.toHaveBeenCalled();
  });

  it('skips payments with missing or unparseable dueDate', async () => {
    vi.mocked(sb.sbGetContracts).mockResolvedValueOnce([
      makeContract([
        { id: 'p1', label: 'X', amount: 100, dueDate: '', status: 'pending' },
        { id: 'p2', label: 'Y', amount: 100, dueDate: 'not-a-date', status: 'pending' },
      ]),
    ]);
    await checkContractDeadlines(user);
    expect(sb.sbSendNotification).not.toHaveBeenCalled();
  });

  it('swallows Supabase errors (does not throw)', async () => {
    vi.mocked(sb.sbGetContracts).mockRejectedValueOnce(new Error('network down'));
    await expect(checkContractDeadlines(user)).resolves.toBeUndefined();
    expect(sb.sbSendNotification).not.toHaveBeenCalled();
  });
});
