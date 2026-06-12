import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));

import { useVisaProjectStore } from './visaProjectStore';
import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/firebase';
import type { User, VisaProjectDoc } from '@/types';

const resetProj = snapshotInitial(useVisaProjectStore);
const resetAuth = snapshotInitial(useAuthStore);

const u: User = { u: 'ceo', p: 'ceo123', role: 'CEO', name: 'Tony', color: '#000' };

beforeEach(() => {
  resetProj();
  resetAuth();
  vi.clearAllMocks();
  useAuthStore.setState({ currentUser: u }, false);
});

function proj(over: Partial<VisaProjectDoc> = {}): VisaProjectDoc {
  return {
    id: 'p1', code: 'DAV-1', name: 'Đoàn HQ', country: 'Hàn Quốc', status: 'planning',
    mainStaff: [], supportStaff: [], documentsSummary: '',
    linkedQuoteId: null, linkedQuoteName: '', linkedProcIds: [], attachments: [],
    applyCount: 0, passedCount: 0, failedCount: 0, haveVisaCount: 0, pendingCount: 0,
    startDate: null, endDate: null, milestones: [], applicants: [],
    collaborators: [], createdByUsername: '', createdByName: '',
    ...over,
  };
}

describe('visaProjectStore', () => {
  it('starts empty', () => {
    expect(useVisaProjectStore.getState().projects).toEqual([]);
  });

  it('init subscribes and populates when callback fires', () => {
    useVisaProjectStore.getState().init();
    expect(fb.fbSubscribeVisaProjects).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(fb.fbSubscribeVisaProjects).mock.calls[0][0];
    cb([proj()]);
    const s = useVisaProjectStore.getState();
    expect(s.projects).toEqual([proj()]);
    expect(s.loading).toBe(false);
  });

  it('save prepends a new project, stamps creator + updatedAt, and pushes', async () => {
    await useVisaProjectStore.getState().save(proj({ id: 'new1', name: 'Đoàn Nhật' }));
    const list = useVisaProjectStore.getState().projects;
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('Đoàn Nhật');
    expect(list[0].createdByUsername).toBe('ceo');
    expect(list[0].updatedBy).toBe('Tony');
    expect(vi.mocked(fb.fbPushVisaProjects).mock.calls[0][1]).toEqual({ name: 'Tony', role: 'CEO' });
  });

  it('save updates an existing project in place', async () => {
    useVisaProjectStore.setState({ projects: [proj({ id: 'p1', name: 'A' })] }, false);
    await useVisaProjectStore.getState().save(proj({ id: 'p1', name: 'A2', status: 'completed' }));
    const list = useVisaProjectStore.getState().projects;
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('A2');
    expect(list[0].status).toBe('completed');
    expect(list[0].updatedBy).toBe('Tony');
  });

  it('save is a no-op without a signed-in user', async () => {
    useAuthStore.setState({ currentUser: null }, false);
    await useVisaProjectStore.getState().save(proj({ id: 'x' }));
    expect(useVisaProjectStore.getState().projects).toEqual([]);
    expect(fb.fbPushVisaProjects).not.toHaveBeenCalled();
  });

  it('remove deletes by id and pushes', async () => {
    useVisaProjectStore.setState({ projects: [proj({ id: 'p1' }), proj({ id: 'p2' })] }, false);
    await useVisaProjectStore.getState().remove('p1');
    expect(useVisaProjectStore.getState().projects.map((p) => p.id)).toEqual(['p2']);
    expect(fb.fbPushVisaProjects).toHaveBeenCalledTimes(1);
  });
});
