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

describe('BroadcastService — «طلبة كورس»', () => {
  const COURSE = '00000000-0000-7000-8000-00000000c001';
  const M1 = '00000000-0000-7000-8000-0000000000a1';
  const M3 = '00000000-0000-7000-8000-0000000000a3';
  const past = new Date(Date.now() - 86_400_000);
  const grant = (userId: string, scope: string, monthId: string | null, extra: object = {}) => ({
    id: `${userId}-${scope}-${monthId ?? 'x'}`,
    userId,
    scope,
    monthId,
    validFrom: past,
    validUntil: null,
    revokedAt: null,
    ...extra,
  });

  // u1 bought «شهر ١» only · u2 holds a term (covers every month) · u3 bought
  // «شهر ٣» · u4 enrolled and never paid · u5's «شهر ١» lapsed.
  function setup() {
    const prisma = {
      ...makePrisma(),
      course: {
        findUnique: jest.fn(async () => ({
          id: COURSE,
          subjectId: 's1',
          requiresGrant: true,
          months: [{ id: M1 }, { id: M3 }],
        })),
      },
      enrollment: {
        findMany: jest.fn(async () => ['u1', 'u2', 'u3', 'u4', 'u5'].map((userId) => ({ userId }))),
      },
      accessGrant: {
        findMany: jest.fn(async () => [
          grant('u1', 'course_month', M1),
          grant('u2', 'term', null),
          grant('u3', 'course_month', M3),
          grant('u5', 'course_month', M1, { validUntil: past }),
        ]),
      },
    };
    const outreach = makeOutreach();
    return { prisma, outreach, service: new BroadcastService(prisma as never, outreach as never) };
  }

  const target = (extra: object) => ({ type: 'course' as const, courseId: COURSE, access: 'any' as const, paidBefore: false, ...extra });

  it('«مشتركوش في شهر ٣» skips the term holder who already owns it', async () => {
    const { service } = setup();
    await expect(service.recipientCount(target({ monthId: M3, access: 'missing' }))).resolves.toBe(3); // u1 u4 u5
  });

  it('«مشتركوش في شهر ٣» + «اشتركوا قبل كده» drops the never-paid', async () => {
    const { service } = setup();
    await expect(
      service.recipientCount(target({ monthId: M3, access: 'missing', paidBefore: true })),
    ).resolves.toBe(2); // u1 u5
  });

  it('«مشتركين في شهر ٣» counts the month buyer and the term holder', async () => {
    const { service } = setup();
    await expect(service.recipientCount(target({ monthId: M3, access: 'has' }))).resolves.toBe(2); // u2 u3
  });

  it('with no month, «مشتركين» is any live subscription to the course', async () => {
    const { service } = setup();
    await expect(service.recipientCount(target({ access: 'has' }))).resolves.toBe(3); // u1 u2 u3
  });

  it('«كل طلبة الكورس» reads enrolments only', async () => {
    const { prisma, service } = setup();
    await expect(service.recipientCount(target({}))).resolves.toBe(5);
    expect(prisma.accessGrant.findMany).not.toHaveBeenCalled();
  });

  it('404s on a month that belongs to another course', async () => {
    const { service } = setup();
    await expect(
      service.recipientCount(target({ monthId: '00000000-0000-7000-8000-0000000000ff', access: 'missing' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sends to exactly the list the count showed', async () => {
    const { outreach, service } = setup();
    const result = await service.send(target({ monthId: M3, access: 'missing', paidBefore: true }), 'اشترك');
    await flush();
    expect(result).toEqual({ queued: 2 });
    expect(outreach.sendManual.mock.calls.map((call) => (call as unknown[])[1])).toEqual([
      { userId: 'u1', body: 'اشترك' },
      { userId: 'u5', body: 'اشترك' },
    ]);
  });
});
