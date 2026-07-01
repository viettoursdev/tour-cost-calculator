import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useGuideScheduleStore } from './guideScheduleStore';
import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as sb from '@/lib/supabase';
import type { GuideRef, User } from '@/types';

const resetGuide = snapshotInitial(useGuideScheduleStore);
const resetAuth = snapshotInitial(useAuthStore);
const u: User = { u: 'ops', p: 'x', role: 'Operations', name: 'Lan', color: '#000' };
const g = (id: string, name: string): GuideRef => ({ kind: 'freelance', id, name });

beforeEach(() => {
  resetGuide();
  resetAuth();
  vi.clearAllMocks();
  useAuthStore.setState({ currentUser: u }, false);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('guideScheduleStore — rollback lạc quan khi push lỗi', () => {
  it('addFreelancer: push OK → giữ HDV', async () => {
    await useGuideScheduleStore.getState().addFreelancer('HDV Nam');
    expect(useGuideScheduleStore.getState().freelancers.map((f) => f.name)).toEqual(['HDV Nam']);
    expect(sb.sbPushGuideSchedule).toHaveBeenCalledTimes(1);
  });

  it('addFreelancer: push LỖI → hoàn tác (không giữ HDV chưa lưu)', async () => {
    vi.mocked(sb.sbPushGuideSchedule).mockRejectedValueOnce(new Error('boom'));
    await useGuideScheduleStore.getState().addFreelancer('HDV Nam');
    expect(useGuideScheduleStore.getState().freelancers).toEqual([]);
  });

  it('setGuides: push LỖI → hoàn tác assignment về trạng thái trước', async () => {
    useGuideScheduleStore.setState({
      assignments: { t0: { tourCloudId: 't0', tourName: 'Cũ', guides: [g('g0', 'Cũ')], legs: [] } },
    }, false);
    vi.mocked(sb.sbPushGuideSchedule).mockRejectedValueOnce(new Error('boom'));
    await useGuideScheduleStore.getState().setGuides('t1', { tourName: 'Tour 1' }, [g('g1', 'A')]);
    // t1 (mới, chưa lưu) bị hoàn tác; t0 (cũ) giữ nguyên.
    expect(Object.keys(useGuideScheduleStore.getState().assignments)).toEqual(['t0']);
  });

  it('removeAssignment: push LỖI → assignment được khôi phục', async () => {
    useGuideScheduleStore.setState({
      assignments: { t0: { tourCloudId: 't0', tourName: 'Cũ', guides: [g('g0', 'Cũ')], legs: [] } },
    }, false);
    vi.mocked(sb.sbPushGuideSchedule).mockRejectedValueOnce(new Error('boom'));
    await useGuideScheduleStore.getState().removeAssignment('t0');
    expect(Object.keys(useGuideScheduleStore.getState().assignments)).toEqual(['t0']);
  });
});
