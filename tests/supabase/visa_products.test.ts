import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbSaveVisaProducts, sbSubscribeVisaProducts } from '../../src/lib/supabase';
import type { VisaProductsDoc } from '../../src/types/visa';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('visa_products gateway', () => {
  beforeEach(async () => {
    await truncate(['visa_product_fees', 'visa_products', 'visa_products_meta']);
  });

  it('saves products+rates and appends a version snapshot on each save', async () => {
    const c = await getViettoursClient();

    const products = [
      {
        id: 'vp-1', country: 'Japan', visaType: 'Tourist', validity: '90 days',
        location: 'HN', markupType: 'percent' as const, markupValue: 10,
        markupCur: 'VND', note: '', active: true,
        fees: [
          { id: 'f-1', name: 'Phí visa', amount: 50, cur: 'USD', perPax: true },
        ],
      },
    ];
    const rates = { USD: 25000, EUR: 27000 };

    // First save — creates version 1
    await sbSaveVisaProducts({ products, rates }, 'tester', c);

    const doc1 = await once<VisaProductsDoc | null>((cb) => sbSubscribeVisaProducts(cb, c));
    expect(doc1).not.toBeNull();
    expect(doc1!.products).toHaveLength(1);
    expect(doc1!.products[0].country).toBe('Japan');
    expect(doc1!.products[0].fees).toHaveLength(1);
    expect(doc1!.products[0].fees[0].amount).toBe(50);
    expect(doc1!.rates).toMatchObject({ USD: 25000, EUR: 27000 });
    expect(doc1!.versions).toHaveLength(1);
    expect(doc1!.versions![0].versionNo).toBe(1);
    expect(doc1!.versions![0].savedBy).toBe('tester');

    // Second save — appends version 2 (total 2 versions, newest first)
    await sbSaveVisaProducts({ products, rates: { USD: 26000 } }, 'tester', c);
    const doc2 = await once<VisaProductsDoc | null>((cb) => sbSubscribeVisaProducts(cb, c));
    expect(doc2!.versions).toHaveLength(2);
    expect(doc2!.versions![0].versionNo).toBe(2);
    expect(doc2!.versions![1].versionNo).toBe(1);
    expect(doc2!.rates).toMatchObject({ USD: 26000 });
  });
});
