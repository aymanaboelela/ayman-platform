import { NotFoundException } from '@nestjs/common';
import { BroadcastService } from './broadcast.service';

/**
 * `sendManual` itself — the actual database write — is `OutreachService`'s
 * own spec's job (see «sendManual» there, exercised against a real
 * conversation). This file is about what `BroadcastService` adds on top:
 * resolving WHO the target is, and — for «everyone» — the chunked,
 * error-isolated fan-out that never touches the real ~4.5k-student dev
 * cohort a naive integration test here would.
 */
function makePrisma(students: { id: string }[] = []) {
  return {
    user: {
      findFirst: jest.fn(async () => null as { id: string } | null),
      findMany: jest.fn(async () => students),
      count: jest.fn(async () => students.length),
    },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  };
}

function makeOutreach() {
  return { sendManual: jest.fn(async () => ({ conversationId: 'c1', messageId: 'm1' })) };
}

/** Lets a queued `deliverAll` run to completion before assertions — it is
 *  deliberately not awaited by `send()` itself, see the class comment. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('BroadcastService.recipientCount', () => {
  it('is 1 when the targeted user exists and is an active student', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'u1' });
    const service = new BroadcastService(prisma as never, makeOutreach() as never);

    await expect(service.recipientCount({ type: 'user', userId: 'u1' })).resolves.toBe(1);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'u1', role: 'student', bannedAt: null },
      select: { id: true },
    });
  });

  it('is 0 for a user id that does not resolve to an active student', async () => {
    const prisma = makePrisma();
    const service = new BroadcastService(prisma as never, makeOutreach() as never);

    await expect(service.recipientCount({ type: 'user', userId: 'ghost' })).resolves.toBe(0);
  });

  it('counts every non-banned student for "all"', async () => {
    const prisma = makePrisma();
    prisma.user.count.mockResolvedValueOnce(42);
    const service = new BroadcastService(prisma as never, makeOutreach() as never);

    await expect(service.recipientCount({ type: 'all' })).resolves.toBe(42);
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { role: 'student', bannedAt: null },
    });
  });
});

describe('BroadcastService.send — one student', () => {
  it('sends synchronously and reports exactly one queued', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'u1' });
    const outreach = makeOutreach();
    const service = new BroadcastService(prisma as never, outreach as never);

    const result = await service.send({ type: 'user', userId: 'u1' }, 'أهلاً');

    expect(result).toEqual({ queued: 1 });
    expect(outreach.sendManual).toHaveBeenCalledTimes(1);
    expect(outreach.sendManual).toHaveBeenCalledWith({}, { userId: 'u1', body: 'أهلاً' });
  });

  it('404s rather than silently no-op-ing on an unknown or banned user', async () => {
    const prisma = makePrisma();
    const outreach = makeOutreach();
    const service = new BroadcastService(prisma as never, outreach as never);

    await expect(service.send({ type: 'user', userId: 'ghost' }, 'أهلاً')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(outreach.sendManual).not.toHaveBeenCalled();
  });
});

describe('BroadcastService.send — everyone', () => {
  it('reports the recipient count immediately, before delivery finishes', async () => {
    const students = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}` }));
    const prisma = makePrisma(students);
    const outreach = makeOutreach();
    // A slow send: if `send()` waited on this, the assertion below would
    // never see the count in time.
    outreach.sendManual.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ conversationId: 'c', messageId: 'm' }), 50)),
    );
    const service = new BroadcastService(prisma as never, outreach as never);

    const result = await service.send({ type: 'all' }, 'رسالة');
    expect(result).toEqual({ queued: 9 });
    // Not yet delivered to everyone — proves `send` did not wait.
    expect(outreach.sendManual.mock.calls.length).toBeLessThan(9);

    await flush();
  });

  it('eventually sends to every resolved student, in chunks under the concurrency ceiling', async () => {
    const students = Array.from({ length: 11 }, (_, i) => ({ id: `s${i}` }));
    const prisma = makePrisma(students);
    const outreach = makeOutreach();
    let inFlight = 0;
    let maxInFlight = 0;
    outreach.sendManual.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { conversationId: 'c', messageId: 'm' };
    });
    const service = new BroadcastService(prisma as never, outreach as never);

    await service.send({ type: 'all' }, 'رسالة');
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(outreach.sendManual).toHaveBeenCalledTimes(11);
    expect(maxInFlight).toBeLessThanOrEqual(4);
  });

  it('one failed recipient does not stop delivery to the rest of the list', async () => {
    const students = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}` }));
    const prisma = makePrisma(students);
    const outreach = makeOutreach();
    outreach.sendManual.mockImplementation(async (_tx: unknown, input: { userId: string }) => {
      if (input.userId === 's2') throw new Error('boom');
      return { conversationId: 'c', messageId: 'm' };
    });
    const service = new BroadcastService(prisma as never, outreach as never);

    await service.send({ type: 'all' }, 'رسالة');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(outreach.sendManual).toHaveBeenCalledTimes(6);
  });
});
