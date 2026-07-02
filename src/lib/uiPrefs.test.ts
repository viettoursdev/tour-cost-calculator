import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UI_PREFS,
  isDefaultUiPrefs,
  normalizeUiPrefs,
  resolveThemeMode,
} from './uiPrefs';

describe('normalizeUiPrefs', () => {
  it('trả mặc định cho blob rỗng/sai kiểu', () => {
    expect(normalizeUiPrefs(null)).toEqual(DEFAULT_UI_PREFS);
    expect(normalizeUiPrefs(undefined)).toEqual(DEFAULT_UI_PREFS);
    expect(normalizeUiPrefs('dark')).toEqual(DEFAULT_UI_PREFS);
    expect(normalizeUiPrefs(42)).toEqual(DEFAULT_UI_PREFS);
    expect(normalizeUiPrefs([])).toEqual({ ...DEFAULT_UI_PREFS });
  });

  it('giữ giá trị hợp lệ', () => {
    expect(normalizeUiPrefs({ mode: 'dark', density: 'compact' })).toEqual({
      mode: 'dark',
      density: 'compact',
    });
    expect(normalizeUiPrefs({ mode: 'system', density: 'comfortable' })).toEqual({
      mode: 'system',
      density: 'comfortable',
    });
  });

  it('thay từng trường sai bằng mặc định, giữ trường đúng', () => {
    expect(normalizeUiPrefs({ mode: 'neon', density: 'compact' })).toEqual({
      mode: 'light',
      density: 'compact',
    });
    expect(normalizeUiPrefs({ mode: 'dark' })).toEqual({ mode: 'dark', density: 'comfortable' });
  });

  it('không mutate mặc định (trả bản sao)', () => {
    const a = normalizeUiPrefs(null);
    a.mode = 'dark';
    expect(DEFAULT_UI_PREFS.mode).toBe('light');
  });
});

describe('resolveThemeMode', () => {
  it('light/dark giữ nguyên bất kể hệ thống', () => {
    expect(resolveThemeMode('light', true)).toBe('light');
    expect(resolveThemeMode('dark', false)).toBe('dark');
  });

  it('system theo prefers-color-scheme', () => {
    expect(resolveThemeMode('system', true)).toBe('dark');
    expect(resolveThemeMode('system', false)).toBe('light');
  });
});

describe('isDefaultUiPrefs', () => {
  it('nhận diện mặc định và khác mặc định', () => {
    expect(isDefaultUiPrefs({ mode: 'light', density: 'comfortable' })).toBe(true);
    expect(isDefaultUiPrefs({ mode: 'dark', density: 'comfortable' })).toBe(false);
    expect(isDefaultUiPrefs({ mode: 'light', density: 'compact' })).toBe(false);
  });
});
