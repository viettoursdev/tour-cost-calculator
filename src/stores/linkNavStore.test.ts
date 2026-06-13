import { describe, it, expect, beforeEach } from 'vitest';
import { useLinkNavStore } from './linkNavStore';

beforeEach(() => useLinkNavStore.setState({ pending: null }, false));

describe('linkNavStore', () => {
  it('starts with no pending', () => {
    expect(useLinkNavStore.getState().pending).toBeNull();
  });

  it('request sets pending; consume returns the id once for a matching kind', () => {
    useLinkNavStore.getState().request('menu', 'm1');
    expect(useLinkNavStore.getState().pending).toEqual({ kind: 'menu', id: 'm1' });
    expect(useLinkNavStore.getState().consume('menu')).toBe('m1');
    expect(useLinkNavStore.getState().pending).toBeNull();
    // second consume returns null
    expect(useLinkNavStore.getState().consume('menu')).toBeNull();
  });

  it('consume returns null and keeps pending when the kind does not match', () => {
    useLinkNavStore.getState().request('itinerary', 'i1');
    expect(useLinkNavStore.getState().consume('menu')).toBeNull();
    expect(useLinkNavStore.getState().pending).toEqual({ kind: 'itinerary', id: 'i1' });
    expect(useLinkNavStore.getState().consume('itinerary')).toBe('i1');
  });
});
