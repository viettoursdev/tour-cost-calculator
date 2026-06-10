import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));

import { useContractStore } from './contractStore';
import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/firebase';
import type { Contract, ContractPayment, User } from '@/types';

const resetContract = snapshotInitial(useContractStore);
const resetAuth = snapshotInitial(useAuthStore);

const u: User = { u: 'ceo', p: 'ceo123', role: 'CEO', name: 'Tony', color: '#000' };

beforeEach(() => {
  resetContract();
  resetAuth();
  vi.clearAllMocks();
  useAuthStore.setState({ currentUser: u }, false);
});

function payment(over: Partial<ContractPayment> = {}): ContractPayment {
  return {
    id: 'p1',
    label: 'Cọc',
    mode: 'percent',
    percent: 30,
    amount: 0,
    dueDate: '',
    note: '',
    status: 'pending',
    ...over,
  };
}

function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'hd1',
    contractNo: 'HD-1',
    contractDate: '',
    contractStatus: 'draft',
    tourName: 'Tour A',
    tourDest: '',
    tourDays: 3,
    tourNights: 2,
    departure: '',
    contractPax: 10,
    pricePerPax: 1_000_000,
    partyB: { name: '', address: '', tel: '', rep: '', title: '', taxCode: '', email: '' },
    includes: [],
    excludes: [],
    payments: [],
    cancels: [],
    bondPercent: 0,
    hasAcceptance: false,
    createdAt: '',
    createdBy: '',
    ...over,
  };
}

describe('contractStore', () => {
  it('starts empty', () => {
    expect(useContractStore.getState().contracts).toEqual([]);
  });

  it('init subscribes and updates list when callback fires', () => {
    useContractStore.getState().init();
    expect(fb.fbSubscribeContracts).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(fb.fbSubscribeContracts).mock.calls[0][0];
    cb([contract()]);
    expect(useContractStore.getState().contracts).toEqual([contract()]);
    expect(useContractStore.getState().loading).toBe(false);
  });

  it('save recomputes percent-mode payment amounts from totalAmount', async () => {
    const c = contract({
      id: '',
      contractPax: 10,
      pricePerPax: 1_000_000,
      payments: [payment({ percent: 30 }), payment({ id: 'p2', percent: 70 })],
    });
    await useContractStore.getState().save(c);
    const saved = useContractStore.getState().contracts[0];
    // total = 10_000_000; 30% = 3_000_000; 70% = 7_000_000
    expect(saved.payments[0].amount).toBe(3_000_000);
    expect(saved.payments[1].amount).toBe(7_000_000);
    expect(saved.createdBy).toBe('Tony');
    expect(saved.id).toMatch(/^hd_\d+$/);
  });

  it('save preserves fixed-mode payment amounts verbatim', async () => {
    const c = contract({
      id: '',
      contractPax: 10,
      pricePerPax: 1_000_000,
      payments: [payment({ mode: 'fixed', percent: undefined, amount: 1234 })],
    });
    await useContractStore.getState().save(c);
    expect(useContractStore.getState().contracts[0].payments[0].amount).toBe(1234);
  });

  it('save updates existing contract and stamps updatedBy', async () => {
    useContractStore.setState({ contracts: [contract({ id: 'hd1' })] }, false);
    await useContractStore.getState().save(contract({ id: 'hd1', tourName: 'New name' }));
    const c = useContractStore.getState().contracts[0];
    expect(c.tourName).toBe('New name');
    expect(c.updatedBy).toBe('Tony');
  });

  it('save is a no-op when not signed in', async () => {
    useAuthStore.setState({ currentUser: null }, false);
    await useContractStore.getState().save(contract({ id: 'x' }));
    expect(useContractStore.getState().contracts).toEqual([]);
    expect(fb.fbPushContracts).not.toHaveBeenCalled();
  });

  it('delete removes by id and pushes', async () => {
    useContractStore.setState({
      contracts: [contract({ id: 'hd1' }), contract({ id: 'hd2' })],
    }, false);
    await useContractStore.getState().delete('hd1');
    expect(useContractStore.getState().contracts.map((c) => c.id)).toEqual(['hd2']);
    expect(fb.fbPushContracts).toHaveBeenCalledTimes(1);
  });

  it('updatePayments replaces payments on matching contract', async () => {
    useContractStore.setState({ contracts: [contract({ id: 'hd1' })] }, false);
    const newPayments = [payment({ id: 'p9', amount: 500 })];
    await useContractStore.getState().updatePayments('hd1', newPayments);
    expect(useContractStore.getState().contracts[0].payments).toEqual(newPayments);
    expect(useContractStore.getState().contracts[0].updatedBy).toBe('Tony');
  });

  it('markAcceptance flips status to completed and records date/note', async () => {
    useContractStore.setState({ contracts: [contract({ id: 'hd1' })] }, false);
    await useContractStore.getState().markAcceptance('hd1', '2026-06-10', 'OK');
    const c = useContractStore.getState().contracts[0];
    expect(c.hasAcceptance).toBe(true);
    expect(c.acceptanceDate).toBe('2026-06-10');
    expect(c.acceptanceNote).toBe('OK');
    expect(c.contractStatus).toBe('completed');
  });

  it('updateStatus changes contractStatus and stamps updatedBy', async () => {
    useContractStore.setState({ contracts: [contract({ id: 'hd1' })] }, false);
    await useContractStore.getState().updateStatus('hd1', 'signed');
    expect(useContractStore.getState().contracts[0].contractStatus).toBe('signed');
    expect(useContractStore.getState().contracts[0].updatedBy).toBe('Tony');
  });
});
