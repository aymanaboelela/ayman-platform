// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { OutreachSettings } from '@ayman/contracts/admin/settings';
import { OUTREACH_KINDS } from '@ayman/contracts/outreach/kinds';
import { parseVariantKey } from '@ayman/contracts/outreach/compose';
import { PrismaClient, type OutreachKind } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { SettingsService } from '../admin/settings/settings.service';
import { OutreachService, type DeliveryContext } from './outreach.service';
import { isoWeek, topicsFor } from './outreach-sweeper.service';

const SETTINGS: OutreachSettings = {
  quizResult: true,
  quizNudge: true,
  lessonPraise: true,
  whatsappInvite: true,
  nudgeAfterHours: 24,
  groupInviteEveryDays: 21,
  maxPerStudentPerDay: 2,
};

const CONTEXT: DeliveryContext = { settings: SETTINGS, whatsappGroupUrl: null };

describe('OutreachService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;

  // The settings read is stubbed rather than seeded: `context()` is one line
  // and every test here is about DELIVERY, not about where the toggles live.
  const settings = {
    read: async () => ({ outreach: SETTINGS, contact: { whatsappGroup: null } }),
  } as unknown as SettingsService;

  const service = new OutreachService(prisma, new NotificationsService(prisma), settings);

  let studentId = '';
  let bannedId = '';

  const facts = (score = 60) =>
    ({
      kind: 'quiz_result' as const,
      quizTitle: 'الحلقات',
      scorePercent: score,
      weakTopics: [{ name: 'الشروط', questionNumbers: [2] }],
      strongTopics: [],
    });

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();
    studentId = (
      await prisma.user.create({
        data: { id: `out-${stamp}`, name: 'محمد أحمد', email: `out-${stamp}@t.test` },
      })
    ).id;
    bannedId = (
      await prisma.user.create({
        data: {
          id: `outb-${stamp}`,
          name: 'محظور',
          email: `outb-${stamp}@t.test`,
          bannedAt: new Date(),
        },
      })
    ).id;
  });

  afterAll(async () => {
    // Conversations are SetNull on user delete, so they are removed explicitly;
    // ledger rows and notifications cascade with the user.
    await prisma.conversation.deleteMany({ where: { userId: { in: [studentId, bannedId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, bannedId] } } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.conversation.deleteMany({ where: { userId: { in: [studentId, bannedId] } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [studentId, bannedId] } } });
  });

  describe('deliver', () => {
    it('writes the message into a conversation the student can answer', async () => {
      const outcome = await service.deliver(
        { userId: studentId, kind: 'quiz_result', dedupeKey: 'a1', facts: facts() },
        CONTEXT,
      );
      expect(outcome).toBe('sent');

      const conversation = await prisma.conversation.findFirstOrThrow({
        where: { userId: studentId },
        include: { messages: true },
      });

      expect(conversation.origin).toBe('outreach');
      // `answered`, not `open`: he spoke last, so the inbox badge — which counts
      // `open` — must not tell him he owes a reply to his own message.
      expect(conversation.status).toBe('answered');
      // Untouched, which is what lights the unread dot on the launcher.
      expect(conversation.visitorReadAt).toBeNull();
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0]!.author).toBe('admin');
      expect(conversation.messages[0]!.body).toContain('محمد');
    });

    it('addresses the student by first name only', async () => {
      await service.deliver(
        { userId: studentId, kind: 'quiz_result', dedupeKey: 'a2', facts: facts() },
        CONTEXT,
      );
      const message = await prisma.conversationMessage.findFirstOrThrow({
        where: { conversation: { userId: studentId } },
      });
      expect(message.body).not.toContain('محمد أحمد');
    });

    it('tells the student a message is waiting', async () => {
      await service.deliver(
        { userId: studentId, kind: 'quiz_nudge', dedupeKey: 'l1', facts: { kind: 'quiz_nudge', lessonTitle: 'درس' } },
        CONTEXT,
      );
      const notification = await prisma.notification.findFirstOrThrow({
        where: { userId: studentId },
      });
      expect(notification.kind).toBe('instructor_message');
      expect(notification.payload).toMatchObject({ outreachKind: 'quiz_nudge' });
    });

    it('sends the same message once, however many times it is asked to', async () => {
      const first = await service.deliver(
        { userId: studentId, kind: 'quiz_result', dedupeKey: 'dup', facts: facts() },
        CONTEXT,
      );
      const second = await service.deliver(
        { userId: studentId, kind: 'quiz_result', dedupeKey: 'dup', facts: facts() },
        CONTEXT,
      );

      expect(first).toBe('sent');
      expect(second).toBe('duplicate');
      expect(await prisma.conversationMessage.count({ where: { conversation: { userId: studentId } } })).toBe(1);
    });

    it('leaves no orphan bubble when the ledger insert loses the race', async () => {
      /*
       * The ordering that makes this work: the message is written first and the
       * ledger row last, inside ONE transaction. A duplicate therefore rolls the
       * message back with it. Written the other way round, a losing racer would
       * leave a second «شفت نتيجتك» in the student's chat with nothing recording
       * that it had been sent.
       */
      await service.deliver(
        { userId: studentId, kind: 'quiz_result', dedupeKey: 'race', facts: facts() },
        CONTEXT,
      );
      await Promise.all(
        Array.from({ length: 4 }, () =>
          service.deliver(
            { userId: studentId, kind: 'quiz_result', dedupeKey: 'race', facts: facts() },
            CONTEXT,
          ),
        ),
      );

      expect(await prisma.conversationMessage.count({ where: { conversation: { userId: studentId } } })).toBe(1);
      expect(await prisma.outreachMessage.count({ where: { userId: studentId } })).toBe(1);
    });

    it('reuses one thread rather than starting a new one each time', async () => {
      await service.deliver(
        { userId: studentId, kind: 'quiz_result', dedupeKey: 'r1', facts: facts() },
        CONTEXT,
      );
      await service.deliver(
        { userId: studentId, kind: 'quiz_result', dedupeKey: 'r2', facts: facts(90) },
        CONTEXT,
      );

      expect(await prisma.conversation.count({ where: { userId: studentId } })).toBe(1);
      expect(await prisma.conversationMessage.count({ where: { conversation: { userId: studentId } } })).toBe(2);
    });

    it('starts a fresh thread rather than writing into one he closed', async () => {
      await service.deliver(
        { userId: studentId, kind: 'quiz_result', dedupeKey: 'c1', facts: facts() },
        CONTEXT,
      );
      await prisma.conversation.updateMany({
        where: { userId: studentId },
        data: { status: 'closed' },
      });
      await service.deliver(
        { userId: studentId, kind: 'quiz_result', dedupeKey: 'c2', facts: facts() },
        CONTEXT,
      );

      // Appending to a closed thread would give the student a message with no
      // reply box under it — see `AssistantService.postMessage`.
      expect(await prisma.conversation.count({ where: { userId: studentId } })).toBe(2);
    });

    it('never writes the same wording twice in a row', async () => {
      for (let index = 0; index < 6; index += 1) {
        await service.deliver(
          { userId: studentId, kind: 'quiz_result', dedupeKey: `v${index}`, facts: facts() },
          CONTEXT,
        );
      }

      const rows = await prisma.outreachMessage.findMany({
        where: { userId: studentId },
        orderBy: { createdAt: 'asc' },
        select: { variantKey: true },
      });
      const bodies = await prisma.conversationMessage.findMany({
        where: { conversation: { userId: studentId } },
        select: { body: true },
      });

      expect(rows).toHaveLength(6);
      expect(new Set(bodies.map((row) => row.body)).size).toBe(6);
      for (let index = 0; index + 1 < rows.length; index += 1) {
        expect(parseVariantKey(rows[index]!.variantKey).g).not.toBe(
          parseVariantKey(rows[index + 1]!.variantKey).g,
        );
      }
    });

    it('will not write to a banned student', async () => {
      expect(
        await service.deliver(
          { userId: bannedId, kind: 'quiz_result', dedupeKey: 'b1', facts: facts() },
          CONTEXT,
        ),
      ).toBe('no-recipient');
      expect(await prisma.conversation.count({ where: { userId: bannedId } })).toBe(0);
    });

    it('will not write to an account that no longer exists', async () => {
      expect(
        await service.deliver(
          { userId: 'nobody-at-all', kind: 'quiz_result', dedupeKey: 'x', facts: facts() },
          CONTEXT,
        ),
      ).toBe('no-recipient');
    });
  });

  describe('the daily cap', () => {
    it('stops a sweep turning into a mailing list', async () => {
      const outcomes = [];
      for (let index = 0; index < 4; index += 1) {
        outcomes.push(
          await service.deliver(
            {
              userId: studentId,
              kind: 'lesson_praise',
              dedupeKey: `p${index}`,
              facts: { kind: 'lesson_praise', lessonTitle: `درس ${index}` },
            },
            CONTEXT,
          ),
        );
      }
      expect(outcomes).toEqual(['sent', 'sent', 'capped', 'capped']);
    });

    it('never withholds a result — the student earned that one', async () => {
      /*
       * The exemption is the point of the rule rather than a hole in it: a
       * student who sits three papers in an evening has earned three replies,
       * and suppressing the third would break the feature precisely for the
       * student using the platform hardest.
       */
      for (let index = 0; index < 3; index += 1) {
        await service.deliver(
          {
            userId: studentId,
            kind: 'lesson_praise',
            dedupeKey: `cap${index}`,
            facts: { kind: 'lesson_praise', lessonTitle: 'درس' },
          },
          CONTEXT,
        );
      }
      expect(
        await service.deliver(
          { userId: studentId, kind: 'quiz_result', dedupeKey: 'earned', facts: facts() },
          CONTEXT,
        ),
      ).toBe('sent');
    });
  });

  describe('context', () => {
    it('reads the toggles and the group link from site settings', async () => {
      await expect(service.context()).resolves.toEqual({
        settings: SETTINGS,
        whatsappGroupUrl: null,
      });
    });
  });
});

describe('topicsFor', () => {
  const question = (slotPosition: number, state: string, name: string | null) => ({
    slotPosition,
    state: state as never,
    version: { bankEntry: { category: name === null ? null : { name } } },
  });

  it('groups the misses by topic, most-missed first', () => {
    const { weakTopics } = topicsFor([
      question(1, 'graded_wrong', 'الحلقات'),
      question(2, 'graded_right', 'المتغيرات'),
      question(3, 'graded_wrong', 'الحلقات'),
      question(4, 'graded_partial', 'الشروط'),
    ]);

    expect(weakTopics).toEqual([
      { name: 'الحلقات', questionNumbers: [1, 3] },
      { name: 'الشروط', questionNumbers: [4] },
    ]);
  });

  it('counts a partial answer as a miss', () => {
    const { weakTopics, strongTopics } = topicsFor([question(1, 'graded_partial', 'الدوال')]);
    expect(weakTopics).toHaveLength(1);
    expect(strongTopics).toEqual([]);
  });

  it('never calls a topic strong when any question in it was missed', () => {
    /*
     * Telling a student they are good at something they just got wrong is the
     * fastest way to prove nobody read the paper.
     */
    const { strongTopics } = topicsFor([
      question(1, 'graded_right', 'الحلقات'),
      question(2, 'graded_wrong', 'الحلقات'),
      question(3, 'graded_right', 'المصفوفات'),
    ]);
    expect(strongTopics).toEqual(['المصفوفات']);
  });

  it('keeps questions whose category was deleted, with no topic name', () => {
    const { weakTopics, strongTopics } = topicsFor([
      question(1, 'graded_wrong', null),
      question(2, 'graded_right', null),
    ]);
    expect(weakTopics).toEqual([{ name: null, questionNumbers: [1] }]);
    // An unnamed group is never praised: «إنت ماسك … كويس» with a blank in it
    // is worse than saying nothing.
    expect(strongTopics).toEqual([]);
  });

  it('leaves an ungraded question out of both lists', () => {
    const { weakTopics, strongTopics } = topicsFor([question(1, 'needs_grading', 'مقالي')]);
    expect(weakTopics).toEqual([]);
    expect(strongTopics).toEqual(['مقالي']);
  });
});

describe('isoWeek', () => {
  it.each([
    ['2026-01-01', '2026-W01'],
    ['2026-08-16', '2026-W33'],
    ['2026-12-31', '2026-W53'],
    // The case a naive dayOfYear/7 gets wrong: 2027-01-01 is a Friday, so it
    // belongs to the week of 2026-12-28 — one duplicate message a year.
    ['2027-01-01', '2026-W53'],
  ])('%s is %s', (date, week) => {
    expect(isoWeek(new Date(`${date}T12:00:00Z`))).toBe(week);
  });
});

describe('the Prisma enum and the contract agree', () => {
  it('has the same four kinds on both sides', () => {
    // A kind added to one side and not the other typechecks fine and then
    // throws on the INSERT, in a cron, in production.
    const prismaKinds: OutreachKind[] = [
      'quiz_result',
      'quiz_nudge',
      'lesson_praise',
      'whatsapp_invite',
    ];
    expect([...prismaKinds].sort()).toEqual([...OUTREACH_KINDS].sort());
  });
});
