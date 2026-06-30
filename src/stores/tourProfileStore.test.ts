import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useTourProfileStore } from './tourProfileStore';
import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import type { TourProfile, User } from '@/types';

const resetProfile = snapshotInitial(useTourProfileStore);
const resetAuth = snapshotInitial(useAuthStore);

const u: User = { u: 'ceo', p: 'ceo123', role: 'CEO', name: 'Tony', color: '#000' };

function profile(over: Partial<TourProfile> = {}): TourProfile {
  return {
    id: 'tp1',
    code: 'NĐ.01.01.25.01',
    kind: 'domestic',
    name: 'Tour Đà Nẵng',
    status: 'open',
    createdAt: '2025-01-01T00:00:00.000Z',
    days: 2,
    nights: 1,
    pax: 10,
    ...over,
  };
}

beforeEach(() => {
  resetProfile();
  resetAuth();
  vi.clearAllMocks();
  useAuthStore.setState({ currentUser: u }, false);
});

describe('tourProfileStore.syncFromPrimary', () => {
  it('ghi đè days/nights từ báo giá chính xuống hồ sơ', async () => {
    useTourProfileStore.setState({ profiles: [profile()] }, false);

    await useTourProfileStore.getState().syncFromPrimary('tp1', {
      name: 'Tour Đà Nẵng',
      dest: 'Đà Nẵng',
      startDate: '2025-03-10',
      pax: 20,
      days: 3,
      nights: 2,
    });

    const p = useTourProfileStore.getState().profiles[0];
    expect(p.days).toBe(3);
    expect(p.nights).toBe(2);
    expect(p.pax).toBe(20);
    expect(p.startDate).toBe('2025-03-10');
    expect(p.dest).toBe('Đà Nẵng');
  });

  it('chỉ thay đổi days/nights cũng được lưu (không bị short-circuit)', async () => {
    useTourProfileStore.setState({ profiles: [profile({ days: 2, nights: 1 })] }, false);

    // Mọi trường khác giữ nguyên, chỉ days/nights đổi → vẫn phải ghi.
    await useTourProfileStore.getState().syncFromPrimary('tp1', { days: 5, nights: 4 });

    const p = useTourProfileStore.getState().profiles[0];
    expect(p.days).toBe(5);
    expect(p.nights).toBe(4);
  });

  it('giữ days/nights cũ khi báo giá không truyền (undefined)', async () => {
    useTourProfileStore.setState({ profiles: [profile({ days: 4, nights: 3 })] }, false);

    await useTourProfileStore.getState().syncFromPrimary('tp1', { name: 'Đổi tên' });

    const p = useTourProfileStore.getState().profiles[0];
    expect(p.name).toBe('Đổi tên');
    expect(p.days).toBe(4);
    expect(p.nights).toBe(3);
  });
});
