import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useCustomerStore } from './customerStore';
import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as sb from '@/lib/supabase';
import type { Customer, User } from '@/types';

const resetCustomer = snapshotInitial(useCustomerStore);
const resetAuth = snapshotInitial(useAuthStore);

const u: User = { u: 'ceo', p: 'ceo123', role: 'CEO', name: 'Tony', color: '#000' };

beforeEach(() => {
  resetCustomer();
  resetAuth();
  vi.clearAllMocks();
  useAuthStore.setState({ currentUser: u }, false);
});

function customer(over: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: 'Khách A',
    type: 'company',
    contacts: [],
    note: '',
    createdAt: '',
    createdBy: '',
    ...over,
  };
}

describe('customerStore', () => {
  it('starts empty', () => {
    expect(useCustomerStore.getState().customers).toEqual([]);
  });

  it('init subscribes and updates list when callback fires', () => {
    useCustomerStore.getState().init();
    expect(sb.sbSubscribeCustomers).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(sb.sbSubscribeCustomers).mock.calls[0][0];
    cb([customer()]);
    const s = useCustomerStore.getState();
    expect(s.customers).toEqual([customer()]);
    expect(s.loading).toBe(false);
  });

  it('save appends a new customer with createdBy=current user and pushes to supabase', async () => {
    await useCustomerStore.getState().save(customer({ id: 'c-new', name: 'X' }));
    const list = useCustomerStore.getState().customers;
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('X');
    expect(list[0].createdBy).toBe('Tony');
    expect(sb.sbPushCustomers).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sb.sbPushCustomers).mock.calls[0][1]).toEqual({ name: 'Tony', role: 'CEO' });
  });

  it('save updates an existing customer and stamps updatedBy', async () => {
    useCustomerStore.setState({ customers: [customer({ id: 'c1', name: 'A' })] }, false);
    await useCustomerStore.getState().save(customer({ id: 'c1', name: 'A renamed' }));
    const list = useCustomerStore.getState().customers;
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('A renamed');
    expect(list[0].updatedBy).toBe('Tony');
  });

  it('save is a no-op when no user is signed in', async () => {
    useAuthStore.setState({ currentUser: null }, false);
    await useCustomerStore.getState().save(customer({ id: 'x' }));
    expect(useCustomerStore.getState().customers).toEqual([]);
    expect(sb.sbPushCustomers).not.toHaveBeenCalled();
  });

  it('delete removes by dbId and deletes the row directly', async () => {
    useCustomerStore.setState({
      customers: [customer({ id: 'c1', dbId: 'u1' }), customer({ id: 'c2', dbId: 'u2' })],
    }, false);
    await useCustomerStore.getState().delete(customer({ id: 'c1', dbId: 'u1' }));
    expect(useCustomerStore.getState().customers).toEqual([customer({ id: 'c2', dbId: 'u2' })]);
    expect(sb.sbDeleteCustomers).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sb.sbDeleteCustomers).mock.calls[0][0]).toEqual([customer({ id: 'c1', dbId: 'u1' })]);
  });

  it('delete still works for legacy rows whose legacy_id (id) is empty', async () => {
    const orphan = customer({ id: '', dbId: 'u-null' });
    useCustomerStore.setState({ customers: [orphan, customer({ id: 'c2', dbId: 'u2' })] }, false);
    await useCustomerStore.getState().delete(orphan);
    expect(useCustomerStore.getState().customers).toEqual([customer({ id: 'c2', dbId: 'u2' })]);
    expect(vi.mocked(sb.sbDeleteCustomers).mock.calls[0][0]).toEqual([orphan]);
  });
});
