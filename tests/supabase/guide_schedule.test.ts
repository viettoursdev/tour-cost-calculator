import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbSubscribeGuideSchedule, sbPushGuideSchedule } from '../../src/lib/supabase';
import type { GuideScheduleDoc } from '@/types';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('guide schedule gateway', () => {
  beforeEach(async () => { await truncate(['guide_schedule']); });

  it('push then subscribe round-trips freelancers + assignments', async () => {
    const c = await getViettoursClient();
    const doc: GuideScheduleDoc = {
      freelancers: [{ id: 'g1', name: 'Anh A' } as GuideScheduleDoc['freelancers'][number]],
      assignments: { t1: { tourCloudId: 't1', tourName: 'Tour 1', guides: [], legs: [] } },
    };
    await sbPushGuideSchedule(doc, { name: 'Admin', role: 'CEO' }, c);
    const got = await once<GuideScheduleDoc>((cb) => sbSubscribeGuideSchedule(cb, c));
    expect(got.freelancers).toHaveLength(1);
    expect(got.assignments.t1.tourName).toBe('Tour 1');
    expect(got.updatedBy).toBe('Admin (CEO)');
  });

  it('subscribe on empty table yields defaults', async () => {
    const c = await getViettoursClient();
    const got = await once<GuideScheduleDoc>((cb) => sbSubscribeGuideSchedule(cb, c));
    expect(got.freelancers).toEqual([]);
    expect(got.assignments).toEqual({});
  });
});
