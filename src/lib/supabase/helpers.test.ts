import { describe, it, expect } from 'vitest';
import { serializeWrites } from './helpers';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('serializeWrites', () => {
  it('runs same-key calls one at a time, in order (no interleave)', async () => {
    const log: string[] = [];
    const job = (id: string, delay: number) => () =>
      (async () => {
        log.push(`${id}:start`);
        await tick(delay);
        log.push(`${id}:end`);
      })();

    // B is enqueued while A is still running, but with a shorter body — if it
    // weren't serialized it would finish first and interleave.
    const a = serializeWrites('k', job('A', 30));
    const b = serializeWrites('k', job('B', 1));
    await Promise.all([a, b]);

    expect(log).toEqual(['A:start', 'A:end', 'B:start', 'B:end']);
  });

  it('keeps the chain alive after a rejected call', async () => {
    const ran: string[] = [];
    const a = serializeWrites('k2', async () => {
      throw new Error('boom');
    });
    const b = serializeWrites('k2', async () => {
      ran.push('B');
    });

    await expect(a).rejects.toThrow('boom');
    await expect(b).resolves.toBeUndefined();
    expect(ran).toEqual(['B']);
  });

  it('does not serialize across different keys', async () => {
    const log: string[] = [];
    const a = serializeWrites('x', () =>
      (async () => {
        log.push('x:start');
        await tick(20);
        log.push('x:end');
      })(),
    );
    const b = serializeWrites('y', () =>
      (async () => {
        log.push('y:start');
        log.push('y:end');
      })(),
    );
    await Promise.all([a, b]);

    // y runs to completion before x finishes — independent locks.
    expect(log).toEqual(['x:start', 'y:start', 'y:end', 'x:end']);
  });
});
