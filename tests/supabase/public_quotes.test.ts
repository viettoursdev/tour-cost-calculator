import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { getViettoursClient, truncate } from './_setup';
import {
  sbPublishQuote, sbGetPublicQuote, sbAcceptPublicQuote, sbUnpublishQuote,
} from '../../src/lib/supabase';
import type { PublicQuoteDoc } from '@/types';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const mk = (token: string): PublicQuoteDoc => ({
  token, quoteCloudId: 'q1', tourName: 'Tour X', pax: 2, days: 3, nights: 2,
  pricePerPax: 1000, totalPrice: 2000, inclusions: [], exclusions: [], payments: [],
  publishedAt: '2026-01-01T00:00:00.000Z', publishedBy: 'Admin',
});

describe('public quotes gateway', () => {
  beforeEach(async () => { await truncate(['public_quotes']); });

  it('publish then get round-trips the doc', async () => {
    const c = await getViettoursClient();
    await sbPublishQuote(mk('tokA'), c);
    const got = await sbGetPublicQuote('tokA', c);
    expect(got?.tourName).toBe('Tour X');
    expect(got?.acceptance).toBeUndefined();
  });

  it('anonymous client can READ but not publish', async () => {
    const c = await getViettoursClient();
    await sbPublishQuote(mk('tokB'), c);
    const anon = anonClient();
    const got = await sbGetPublicQuote('tokB', anon);
    expect(got?.tourName).toBe('Tour X');
    // anon insert is denied by RLS
    const ins = await anon.from('public_quotes').insert({ token: 'tokX', payload: {} });
    expect(ins.error).toBeTruthy();
  });

  it('accept-once: anon accepts, second accept is a no-op', async () => {
    const c = await getViettoursClient();
    await sbPublishQuote(mk('tokC'), c);
    const anon = anonClient();
    await sbAcceptPublicQuote('tokC', { name: 'Khach', at: '2026-01-02T00:00:00.000Z' }, anon);
    let got = await sbGetPublicQuote('tokC', c);
    expect(got?.acceptance?.name).toBe('Khach');
    await sbAcceptPublicQuote('tokC', { name: 'Khac2', at: '2026-01-03T00:00:00.000Z' }, anon);
    got = await sbGetPublicQuote('tokC', c);
    expect(got?.acceptance?.name).toBe('Khach'); // unchanged
  });

  it('unpublish deletes the doc', async () => {
    const c = await getViettoursClient();
    await sbPublishQuote(mk('tokD'), c);
    await sbUnpublishQuote('tokD', c);
    expect(await sbGetPublicQuote('tokD', c)).toBeNull();
  });
});
