import { describe, it, expect, beforeEach } from 'vitest';
import { getRememberedEmail, setRememberedEmail } from './rememberedEmail';

beforeEach(() => {
  localStorage.clear();
});

describe('rememberedEmail', () => {
  it('returns null when nothing is stored', () => {
    expect(getRememberedEmail()).toBeNull();
  });

  it('round-trips an email', () => {
    setRememberedEmail('ceo@viettours.com.vn');
    expect(getRememberedEmail()).toBe('ceo@viettours.com.vn');
  });

  it('normalizes by trimming whitespace', () => {
    setRememberedEmail('  ceo@viettours.com.vn  ');
    expect(getRememberedEmail()).toBe('ceo@viettours.com.vn');
  });

  it('normalizes by lowercasing', () => {
    setRememberedEmail('CEO@Viettours.COM.VN');
    expect(getRememberedEmail()).toBe('ceo@viettours.com.vn');
  });

  it('empty string removes the stored value', () => {
    setRememberedEmail('ceo@viettours.com.vn');
    setRememberedEmail('');
    expect(getRememberedEmail()).toBeNull();
  });

  it('whitespace-only input removes the stored value', () => {
    setRememberedEmail('ceo@viettours.com.vn');
    setRememberedEmail('   ');
    expect(getRememberedEmail()).toBeNull();
  });

  it('uses the LS key "vte_remembered_email"', () => {
    setRememberedEmail('ceo@viettours.com.vn');
    expect(localStorage.getItem('vte_remembered_email')).toBe('ceo@viettours.com.vn');
  });
});
