import { NotFoundException } from '@nestjs/common';
import { AssistantQuestionService } from './assistant-question.service';

/**
 * Keeping what students asked — the two rules that make keeping it
 * acceptable, and the correlation `context()`/`list()` reconstruct from it.
 */

function make(
  over: {
    create?: jest.Mock;
    findMany?: jest.Mock;
    findUnique?: jest.Mock;
    count?: jest.Mock;
    deleteMany?: jest.Mock;
    conversationFindMany?: jest.Mock;
  } = {},
) {
  const create = over.create ?? jest.fn(async () => ({ id: 'x' }));
  const findMany = over.findMany ?? jest.fn(async () => []);
  const findUnique = over.findUnique ?? jest.fn(async () => null);
  const count = over.count ?? jest.fn(async () => 0);
  const deleteMany = over.deleteMany ?? jest.fn(async () => ({ count: 0 }));
  const conversationFindMany = over.conversationFindMany ?? jest.fn(async () => []);
  const prisma = {
    assistantQuestion: { create, findMany, findUnique, count, deleteMany },
    conversation: { findMany: conversationFindMany },
  };
  return {
    service: new AssistantQuestionService(prisma as never),
    create,
    findMany,
    findUnique,
    count,
    deleteMany,
    conversationFindMany,
  };
}

describe('record', () => {
  it('keeps the exchange with the identity that was passed and nothing else', async () => {
    const { service, create } = make();
    await service.record({
      userId: 'u1',
      question: 'الملخص فين؟',
      answer: 'مع الدرس نفسه.',
      provider: 'gemini:x',
      escalated: false,
    });

    const data = create.mock.calls[0]![0].data;
    expect(data).toEqual({
      userId: 'u1',
      question: 'الملخص فين؟',
      answer: 'مع الدرس نفسه.',
      provider: 'gemini:x',
      escalated: false,
    });
    // ⚠️ No name, phone, IP or token may ever appear here — the admin screen
    // joins the name from `users` at read time precisely so this table holds
    // no copy of it.
    expect(Object.keys(data).sort()).toEqual(
      ['answer', 'escalated', 'provider', 'question', 'userId'].sort(),
    );
  });

  it('records a visitor as nobody rather than as a pseudonym', async () => {
    const { service, create } = make();
    await service.record({ userId: null, question: 'س', answer: 'ج', provider: null, escalated: true });
    expect(create.mock.calls[0]![0].data.userId).toBeNull();
  });

  /**
   * ⚠️ A failed INSERT must not cost a student the reply they have already
   * read. `record` runs after the stream has finished, and swallowing here is
   * what keeps the two independent.
   */
  it('never throws, whatever the database does', async () => {
    const { service } = make({ create: jest.fn(async () => { throw new Error('db down'); }) });
    await expect(
      service.record({ userId: null, question: 'س', answer: 'ج', provider: null, escalated: false }),
    ).resolves.toBeUndefined();
  });

  it('keeps nothing when there is nothing to learn', async () => {
    const { service, create } = make();
    await service.record({ userId: 'u1', question: '   ', answer: 'ج', provider: null, escalated: false });
    await service.record({ userId: 'u1', question: 'س', answer: '', provider: null, escalated: false });
    expect(create).not.toHaveBeenCalled();
  });

  it('caps what a single row can hold', async () => {
    const { service, create } = make();
    await service.record({
      userId: null,
      question: 'ط'.repeat(9000),
      answer: 'ر'.repeat(9000),
      provider: null,
      escalated: false,
    });
    expect(create.mock.calls[0]![0].data.question.length).toBe(4000);
    expect(create.mock.calls[0]![0].data.answer.length).toBe(4000);
  });
});

describe('list', () => {
  it('searches the QUESTION only, never the answer', async () => {
    /*
     * Somebody hunting «الملخص» wants the students who asked about it.
     * Matching the answer would return every row the same paragraph was sent
     * to, which is most of them.
     */
    const { service, findMany } = make();
    await service.list({ page: 1, perPage: 20, q: 'الملخص', dir: 'desc', escalatedOnly: false });
    const where = findMany.mock.calls[0]![0].where;
    expect(where.question).toEqual({ contains: 'الملخص', mode: 'insensitive' });
    expect(where.answer).toBeUndefined();
  });

  it('filters to the rows that needed a person', async () => {
    const { service, findMany } = make();
    await service.list({ page: 1, perPage: 20, q: '', dir: 'desc', escalatedOnly: true });
    expect(findMany.mock.calls[0]![0].where.escalated).toBe(true);
  });

  it('joins the name instead of reading a stored one', async () => {
    const { service, findMany } = make({
      findMany: jest.fn(async () => [
        {
          id: 'q1',
          question: 'س',
          answer: 'ج',
          provider: null,
          escalated: true,
          createdAt: new Date('2026-08-22T10:00:00.000Z'),
          user: { name: 'ندى' },
        },
      ]),
    });
    const page = await service.list({ page: 1, perPage: 20, q: '', dir: 'desc', escalatedOnly: false });

    expect(findMany.mock.calls[0]![0].select.user).toEqual({ select: { name: true } });
    expect(page.rows[0]!.studentName).toBe('ندى');
    // A deleted account leaves the question and loses the name — which is the
    // whole point of joining rather than storing it.
    expect(page.rows[0]!.provider).toBeNull();
  });

  it('reports a visitor with no name at all', async () => {
    const { service } = make({
      findMany: jest.fn(async () => [
        {
          id: 'q1', question: 'س', answer: 'ج', provider: 'groq:y', escalated: false,
          createdAt: new Date('2026-08-22T10:00:00.000Z'), user: null,
        },
      ]),
    });
    const page = await service.list({ page: 1, perPage: 20, q: '', dir: 'desc', escalatedOnly: false });
    expect(page.rows[0]!.studentName).toBeNull();
  });

  it('marks a row with no account as a guest', async () => {
    const { service } = make({
      findMany: jest.fn(async () => [
        { id: 'q1', userId: null, question: 'س', answer: 'ج', provider: null, escalated: false,
          createdAt: new Date('2026-08-22T10:00:00.000Z'), user: null },
      ]),
    });
    const page = await service.list({ page: 1, perPage: 20, q: '', dir: 'desc', escalatedOnly: false });
    expect(page.rows[0]!.isGuest).toBe(true);
    expect(page.rows[0]!.conversationId).toBeNull();
  });

  it('never looks up a conversation for a row that was not escalated', async () => {
    const { service, conversationFindMany } = make({
      findMany: jest.fn(async () => [
        { id: 'q1', userId: 'u1', question: 'س', answer: 'ج', provider: null, escalated: false,
          createdAt: new Date('2026-08-22T10:00:00.000Z'), user: { name: 'ندى' } },
      ]),
    });
    const page = await service.list({ page: 1, perPage: 20, q: '', dir: 'desc', escalatedOnly: false });
    expect(conversationFindMany).not.toHaveBeenCalled();
    expect(page.rows[0]!.conversationId).toBeNull();
  });

  it('never looks up a conversation for an escalated GUEST row — there is no identity to match on', async () => {
    const { service, conversationFindMany } = make({
      findMany: jest.fn(async () => [
        { id: 'q1', userId: null, question: 'س', answer: 'ج', provider: null, escalated: true,
          createdAt: new Date('2026-08-22T10:00:00.000Z'), user: null },
      ]),
    });
    const page = await service.list({ page: 1, perPage: 20, q: '', dir: 'desc', escalatedOnly: false });
    expect(conversationFindMany).not.toHaveBeenCalled();
    expect(page.rows[0]!.conversationId).toBeNull();
  });

  it('links an escalated row to the conversation closest to it in time, not merely the first one', async () => {
    const askedAt = new Date('2026-08-22T10:00:00.000Z');
    const { service, conversationFindMany } = make({
      findMany: jest.fn(async () => [
        { id: 'q1', userId: 'u1', question: 'س', answer: 'ج', provider: null, escalated: true,
          createdAt: askedAt, user: { name: 'ندى' } },
      ]),
      conversationFindMany: jest.fn(async () => [
        // Opened a day earlier — about something else, most likely.
        { id: 'far', userId: 'u1', createdAt: new Date('2026-08-21T10:00:00.000Z') },
        // Opened twenty minutes later — almost certainly this escalation.
        { id: 'near', userId: 'u1', createdAt: new Date('2026-08-22T10:20:00.000Z') },
      ]),
    });
    const page = await service.list({ page: 1, perPage: 20, q: '', dir: 'desc', escalatedOnly: false });

    expect(conversationFindMany.mock.calls[0]![0].where.userId).toEqual({ in: ['u1'] });
    expect(page.rows[0]!.conversationId).toBe('near');
  });

  it('batches the conversation lookup into one query for a whole page, not one per row', async () => {
    const { service, conversationFindMany } = make({
      findMany: jest.fn(async () => [
        { id: 'q1', userId: 'u1', question: 'س', answer: 'ج', provider: null, escalated: true,
          createdAt: new Date('2026-08-22T10:00:00.000Z'), user: null },
        { id: 'q2', userId: 'u2', question: 'س', answer: 'ج', provider: null, escalated: true,
          createdAt: new Date('2026-08-22T11:00:00.000Z'), user: null },
        // Same user as q1 — must not double the distinct id list.
        { id: 'q3', userId: 'u1', question: 'س', answer: 'ج', provider: null, escalated: true,
          createdAt: new Date('2026-08-22T12:00:00.000Z'), user: null },
      ]),
    });
    await service.list({ page: 1, perPage: 20, q: '', dir: 'desc', escalatedOnly: false });
    expect(conversationFindMany).toHaveBeenCalledTimes(1);
    expect(conversationFindMany.mock.calls[0]![0].where.userId.in.sort()).toEqual(['u1', 'u2']);
  });
});

describe('context', () => {
  it('throws NotFoundException for an id that does not exist', async () => {
    const { service } = make({ findUnique: jest.fn(async () => null) });
    await expect(service.context('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports a guest with no siblings and no conversation, without querying either', async () => {
    const { service, findMany, conversationFindMany } = make({
      findUnique: jest.fn(async () => ({
        id: 'q1', userId: null, question: 'س', answer: 'ج', provider: null, escalated: true,
        createdAt: new Date('2026-08-22T10:00:00.000Z'), user: null,
      })),
    });
    const context = await service.context('q1');
    expect(context.question.isGuest).toBe(true);
    expect(context.siblings).toEqual([]);
    expect(context.conversation).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
    expect(conversationFindMany).not.toHaveBeenCalled();
  });

  it('reconstructs the sibling window around a signed-in student’s question', async () => {
    const askedAt = new Date('2026-08-22T10:00:00.000Z');
    const { service, findMany } = make({
      findUnique: jest.fn(async () => ({
        id: 'q1', userId: 'u1', question: 'الملخص فين', answer: 'مع الدرس', provider: null,
        escalated: false, createdAt: askedAt, user: { name: 'ندى' },
      })),
      findMany: jest.fn(async () => [
        { id: 'q0', userId: 'u1', question: 'إزاي أشترك', answer: 'من هنا', provider: null,
          escalated: false, createdAt: new Date('2026-08-22T09:30:00.000Z'), user: { name: 'ندى' } },
      ]),
    });
    const context = await service.context('q1');

    const call = findMany.mock.calls[0]![0];
    expect(call.where.userId).toBe('u1');
    expect(call.where.id).toEqual({ not: 'q1' });
    // ±3 hours around the question's own time.
    expect(call.where.createdAt.gte.toISOString()).toBe('2026-08-22T07:00:00.000Z');
    expect(call.where.createdAt.lte.toISOString()).toBe('2026-08-22T13:00:00.000Z');
    expect(context.siblings).toHaveLength(1);
    expect(context.siblings[0]!.question).toBe('إزاي أشترك');
  });

  it('links to the conversation closest in time, choosing over a more distant one', async () => {
    const askedAt = new Date('2026-08-22T10:00:00.000Z');
    const { service } = make({
      findUnique: jest.fn(async () => ({
        id: 'q1', userId: 'u1', question: 'س', answer: 'ج', provider: null, escalated: true,
        createdAt: askedAt, user: { name: 'ندى' },
      })),
      conversationFindMany: jest.fn(async () => [
        { id: 'far', status: 'closed', createdAt: new Date('2026-08-20T10:00:00.000Z') },
        { id: 'near', status: 'open', createdAt: new Date('2026-08-22T10:05:00.000Z') },
      ]),
    });
    const context = await service.context('q1');
    expect(context.conversation).toEqual({
      id: 'near',
      status: 'open',
      startedAt: '2026-08-22T10:05:00.000Z',
    });
  });

  it('reports no conversation when the student has never opened one', async () => {
    const { service } = make({
      findUnique: jest.fn(async () => ({
        id: 'q1', userId: 'u1', question: 'س', answer: 'ج', provider: null, escalated: true,
        createdAt: new Date('2026-08-22T10:00:00.000Z'), user: { name: 'ندى' },
      })),
    });
    const context = await service.context('q1');
    expect(context.conversation).toBeNull();
  });
});

describe('sweep', () => {
  it('deletes only what is past the retention window', async () => {
    const { service, deleteMany } = make();
    const before = Date.now();
    await service.sweep();

    const cutoff = deleteMany.mock.calls[0]![0].where.createdAt.lt as Date;
    const days = (before - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    // Ninety days — long enough to see a term, short enough that a dump is not
    // a permanent record of what a fifteen-year-old typed.
    expect(Math.round(days)).toBe(90);
  });

  it('never throws, so a bad night cannot take the scheduler down', async () => {
    const { service } = make({ deleteMany: jest.fn(async () => { throw new Error('db down'); }) });
    await expect(service.sweep()).resolves.toBeUndefined();
  });
});
