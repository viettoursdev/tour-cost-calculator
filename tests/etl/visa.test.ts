import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';
import { loadVisaProcedures, loadVisaProjects } from '../../scripts/etl/visa.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

describe('etl visa', () => {
  let r: ReturnType<typeof makeResolver>;
  beforeAll(async () => {
    await resetAll(c);
    r = makeResolver(await loadProfiles(c, dump));
    await loadVisaProcedures(c, dump, r);
    await loadVisaProjects(c, dump, r);
  });

  it('loads visa procedure resolving created_by + collaborators array', async () => {
    const { data } = await c.from('visa_procedures').select('legacy_id, created_by, created_by_username, collaborators, collaborator_usernames');
    expect(data).toHaveLength(1);
    expect(data![0].created_by).toBe(r.resolve('tony'));
    expect(data![0].created_by_username).toBe('tony');
    expect(data![0].collaborators).toEqual([r.resolve('mai')]);
    expect(data![0].collaborator_usernames).toEqual(['mai']);
  });

  it('loads visa project resolving main/support/collaborator staff arrays', async () => {
    const { data } = await c.from('visa_projects').select('legacy_id, main_staff, support_staff, collaborators, main_staff_usernames, created_by_username');
    expect(data).toHaveLength(1);
    expect(data![0].main_staff).toEqual([r.resolve('tony')]);
    expect(data![0].support_staff).toEqual([r.resolve('mai')]);
    expect(data![0].collaborators).toEqual([r.resolve('linh')]);
    expect(data![0].main_staff_usernames).toEqual(['tony']);
    expect(data![0].created_by_username).toBe('tony');
  });
});
