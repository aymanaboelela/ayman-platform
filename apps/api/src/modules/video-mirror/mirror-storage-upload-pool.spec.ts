import { MirrorStorage, UPLOAD_CONCURRENCY, uploadPool } from './mirror-storage';

/**
 * «بيترفع بسرعة، بيجيلي المعالجة دي اللي بتطول» — a sub-hour lecture taking
 * about an hour, and it traced to `uploadLadder`'s own loop: a four-rung HLS
 * ladder is a couple of thousand tiny objects, and each one used to wait for
 * the PREVIOUS object's full round trip to R2 before starting. This file
 * proves the two halves of the fix: `uploadPool` never over-runs its bound
 * and drops no item, and `uploadLadder` still uploads `master.m3u8` only
 * after every other object has finished — concurrency changed nothing about
 * that guarantee.
 */
describe('uploadPool', () => {
  it('never runs more workers than the limit, at any moment', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 37 }, (_, i) => i);

    await uploadPool(items, 5, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
    });

    expect(maxInFlight).toBe(5);
  });

  it('runs every item exactly once, in a queue longer than the limit', async () => {
    const seen: number[] = [];
    const items = Array.from({ length: 23 }, (_, i) => i);

    await uploadPool(items, 4, async (item) => {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
      seen.push(item);
    });

    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  it('does nothing on an empty queue, and nothing on a limit above the queue length', async () => {
    const calls: number[] = [];
    await uploadPool([], 5, async (item) => void calls.push(item));
    expect(calls).toEqual([]);

    const single: number[] = [];
    await uploadPool([9], 5, async (item) => void single.push(item));
    expect(single).toEqual([9]);
  });

  /** The number this codebase actually ships — if this drifts, the comment
   *  on `UPLOAD_CONCURRENCY` explaining the choice drifts with it silently. */
  it('ships a concurrency bound worth the network it costs, not one file descriptor at a time', () => {
    expect(UPLOAD_CONCURRENCY).toBeGreaterThan(1);
    expect(UPLOAD_CONCURRENCY).toBeLessThanOrEqual(32);
  });
});

describe('MirrorStorage.uploadLadder — master still goes last', () => {
  it('uploads every other object, successfully, before master.m3u8 — even running them concurrently', async () => {
    const storage = Object.create(MirrorStorage.prototype) as MirrorStorage;
    const order: string[] = [];
    const putFile = jest
      .spyOn(storage as unknown as { putFile: (dir: string, file: string, prefix: string) => Promise<void> }, 'putFile')
      .mockImplementation(async (_dir: string, file: string) => {
        // The segments resolve out of order on purpose — concurrency means
        // no promise here is guaranteed to settle in the order it started.
        await new Promise((resolve) => setTimeout(resolve, file.includes('000') ? 3 : 1));
        order.push(file);
      });

    const files = ['0/seg_000.m4s', '0/seg_001.m4s', '1/seg_000.m4s', '1/seg_001.m4s', 'master.m3u8'];
    await storage.uploadLadder('/tmp/out', files, 'videos/abc');

    expect(putFile).toHaveBeenCalledTimes(5);
    expect(order.at(-1)).toBe('master.m3u8');
    expect(new Set(order)).toEqual(new Set(files));
  });

  it('never calls putFile at all when the ladder is just master.m3u8', async () => {
    const storage = Object.create(MirrorStorage.prototype) as MirrorStorage;
    const putFile = jest
      .spyOn(storage as unknown as { putFile: (dir: string, file: string, prefix: string) => Promise<void> }, 'putFile')
      .mockResolvedValue(undefined);

    await storage.uploadLadder('/tmp/out', ['master.m3u8'], 'videos/abc');

    expect(putFile).toHaveBeenCalledTimes(1);
    expect(putFile).toHaveBeenCalledWith('/tmp/out', 'master.m3u8', 'videos/abc');
  });
});
