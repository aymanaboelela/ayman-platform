// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConversationThreadSchema } from '@ayman/contracts/assistant/conversation';
import { SUMMARY_PREVIEW_MAX } from '@ayman/contracts/assistant/summary';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AssistantService } from './assistant.service';

describe('AssistantService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new AssistantService(prisma, new NotificationsService(prisma));

  let studentId = '';
  let strangerId = '';
  const createdConversations: string[] = [];

  /** Opens a guest thread and remembers it for teardown. */
  async function openGuest(phone = '+201000000001', message = 'الكورس بكام؟') {
    const result = await service.open({
      entryPath: ['root', 'join', 'joinPrice'],
      message,
      userId: null,
      guest: { name: 'زائر', phone },
    });
    createdConversations.push(result.thread.id);
    return result;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    studentId = (
      await prisma.user.create({
        data: { id: `asst-${stamp}`, name: 'طالب المساعد', email: `asst-${stamp}@t.test` },
      })
    ).id;
    strangerId = (
      await prisma.user.create({
        data: { id: `asstx-${stamp}`, name: 'غريب', email: `asstx-${stamp}@t.test` },
      })
    ).id;
  });

  afterAll(async () => {
    // Messages cascade with the conversation; notifications cascade with the
    // user. Deleting the two users is therefore enough for everything this
    // spec created through a signed-in path.
    if (createdConversations.length > 0) {
      await prisma.conversation.deleteMany({ where: { id: { in: createdConversations } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [studentId, strangerId] } } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Each test starts from zero open threads, so the per-identity cap does not
    // leak between them and produce a confusing failure three tests later.
    if (createdConversations.length > 0) {
      await prisma.conversation.deleteMany({ where: { id: { in: createdConversations } } });
      createdConversations.length = 0;
    }
    await prisma.notification.deleteMany({ where: { userId: studentId } });
  });

  describe('open', () => {
    it('writes the thread and its first message together', async () => {
      const { thread } = await openGuest();

      expect(thread.messages).toHaveLength(1);
      expect(thread.messages[0]).toMatchObject({ author: 'visitor', body: 'الكورس بكام؟' });
      expect(thread.status).toBe('open');
      expect(thread.entryPath).toEqual(['root', 'join', 'joinPrice']);
    });

    it('stores only the HASH of the guest token', async () => {
      // The whole point of the scheme: a dump of this table hands out no read
      // access, because the column cannot be replayed as a cookie.
      const { thread, guestToken } = await openGuest();
      expect(guestToken).toBeTruthy();

      const row = await prisma.conversation.findUniqueOrThrow({
        where: { id: thread.id },
        select: { guestTokenHash: true },
      });
      expect(row.guestTokenHash).toBe(createHash('sha256').update(guestToken!).digest('hex'));
      expect(row.guestTokenHash).not.toBe(guestToken);
    });

    it('refuses a guest with no way to be reached', async () => {
      await expect(
        service.open({ entryPath: [], message: 'سؤال', userId: null, guest: null }),
      ).rejects.toBeInstanceOf(Error);
    });

    it('ignores a name and phone posted by a signed-in student', async () => {
      /*
       * Identity comes from the SESSION, never the body. If this regressed,
       * the inbox would show whatever name the poster typed beside a message
       * attributed to a real account — the exact confusion the inbox exists to
       * prevent.
       */
      const { thread, guestToken } = await service.open({
        entryPath: ['root'],
        message: 'سؤال من طالب',
        userId: studentId,
        guest: { name: 'اسم مزيّف', phone: '+201000000009' },
      });
      createdConversations.push(thread.id);

      expect(guestToken).toBeNull();
      const row = await prisma.conversation.findUniqueOrThrow({
        where: { id: thread.id },
        select: { userId: true, guestName: true, guestPhone: true, guestTokenHash: true },
      });
      expect(row).toEqual({
        userId: studentId,
        guestName: null,
        guestPhone: null,
        guestTokenHash: null,
      });
    });

    it('caps how many threads one identity may have open', async () => {
      // The throttler limits requests per unit time; this limits STATE. A
      // script posting once an hour passes every rate limit and still fills
      // the inbox.
      const phone = '+201000000002';
      await openGuest(phone);
      await openGuest(phone);
      await openGuest(phone);

      await expect(openGuest(phone)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('does not count closed threads against the cap', async () => {
      const phone = '+201000000003';
      const first = await openGuest(phone);
      await openGuest(phone);
      await openGuest(phone);
      await service.setStatus(first.thread.id, 'closed');

      await expect(openGuest(phone)).resolves.toBeDefined();
    });
  });

  describe('ownership', () => {
    it('resolves a guest thread from its token', async () => {
      const { thread, guestToken } = await openGuest();
      const mine = await service.myThread(null, guestToken);
      expect(mine?.id).toBe(thread.id);
    });

    it('returns null — not another visitor’s thread — for a wrong token', async () => {
      await openGuest();
      const mine = await service.myThread(null, 'a-token-that-was-never-minted');
      expect(mine).toBeNull();
    });

    it('returns null for a caller with no identity at all', async () => {
      await openGuest();
      expect(await service.myThread(null, null)).toBeNull();
    });

    it('does not let one student read another student’s thread', async () => {
      const { thread } = await service.open({
        entryPath: ['root'],
        message: 'خاص',
        userId: studentId,
        guest: null,
      });
      createdConversations.push(thread.id);

      expect(await service.myThread(strangerId, null)).toBeNull();
    });

    it('404s a follow-up posted to a thread the caller does not own', async () => {
      /*
       * The id is REAL and the message is well-formed — only the identity is
       * wrong. This is the guessed-id case, and it has to fail on the WHERE
       * clause rather than on a fetch-then-compare, which would still confirm
       * the id exists.
       */
      const { thread } = await openGuest();
      await expect(
        service.postMessage(thread.id, strangerId, null, 'أنا مش صاحب المحادثة دي'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a follow-up on a closed thread', async () => {
      const { thread, guestToken } = await openGuest();
      await service.setStatus(thread.id, 'closed');

      await expect(
        service.postMessage(thread.id, null, guestToken, 'تاني'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('summarises a thread without shipping a word of it', async () => {
      /*
       * What the launcher gets on every page load. If this ever grew a
       * `messages` key it would be `mine` again under another name, and the
       * landing page would be back to downloading a conversation to draw a
       * dot.
       */
      const { thread, guestToken } = await openGuest(
        '+201000000006',
        'سؤال فيه كلمة مميزة أوي',
      );
      const summary = await service.myThreadSummary(null, guestToken);

      // `latestFromAyman` is null here — the only message in this thread is
      // the VISITOR's, and the preview only ever carries an unread ADMIN one.
      // That is also what keeps the assertion below true: the field is the one
      // string on this shape, and it must not be the visitor's own words.
      expect(summary).toEqual({
        unread: 0,
        hasThread: true,
        hasOpenThread: true,
        latestFromAyman: null,
      });
      expect(JSON.stringify(summary)).not.toContain('مميزة');
      expect(thread.messages).toHaveLength(1); // …which the full shape still carries
    });

    it('counts the same unread the full thread does', async () => {
      // The dot is the only thing this number drives, so the two shapes
      // disagreeing means the launcher lies about a waiting reply. Derived
      // from `myThread` rather than counted again, exactly so this holds.
      const { thread, guestToken } = await openGuest('+201000000007');
      await service.reply(thread.id, 'ردّي');

      const full = await service.myThread(null, guestToken);
      const summary = await service.myThreadSummary(null, guestToken);
      expect(summary.unread).toBe(full!.unreadForVisitor);
      expect(summary.unread).toBe(1);

      await service.markVisitorRead(thread.id, null, guestToken);
      expect((await service.myThreadSummary(null, guestToken)).unread).toBe(0);
    });

    it('never buries an answer under a newer thread', async () => {
      /*
       * The failure this exists for, in full:
       *
       *   10:00  he answers the question she asked      (thread A, unread)
       *   10:30  the platform sends her a result note   (thread B, unread)
       *   11:00  she opens the widget
       *
       * With `orderBy: lastMessageAt desc` — which is what this was until
       * «رسايل م. أيمن» gave every student a second thread — she gets B, and A
       * is unreachable: `lastMessageAt` never moves again on its own, and BOTH
       * her notifications deep-link to `?assistant=1`, which lands here. The
       * answer to the question she actually asked is lost, silently.
       */
      const first = await service.open({
        entryPath: ['root'],
        message: 'سؤالي الأصلي',
        userId: studentId,
        guest: null,
      });
      createdConversations.push(first.thread.id);
      await service.reply(first.thread.id, 'رد أيمن على سؤالك');

      // A second, NEWER thread with something unread in it — the shape an
      // outreach message creates.
      const second = await service.open({
        entryPath: ['root'],
        message: 'سؤال تاني',
        userId: studentId,
        guest: null,
      });
      createdConversations.push(second.thread.id);
      await service.reply(second.thread.id, 'رد أيمن التاني');

      // The OLDER unread one, not the newer: the queue drains in order.
      expect((await service.myThread(studentId, null))?.id).toBe(first.thread.id);

      // …and once she has read it, the newer one is what she lands on.
      await service.markVisitorRead(first.thread.id, studentId, null);
      expect((await service.myThread(studentId, null))?.id).toBe(second.thread.id);

      // With nothing unread anywhere it falls back to newest — the old
      // behaviour, and the common case.
      await service.markVisitorRead(second.thread.id, studentId, null);
      expect((await service.myThread(studentId, null))?.id).toBe(second.thread.id);
    });

    it('still counts a thread unread when only the SECOND reply is new', async () => {
      // Anchoring the rule on a thread's FIRST admin message gets this wrong:
      // she reads his first reply, he writes again, and the thread reads as
      // handled while an answer sits in it unseen.
      const { thread } = await service.open({
        entryPath: ['root'],
        message: 'سؤال',
        userId: studentId,
        guest: null,
      });
      createdConversations.push(thread.id);

      await service.reply(thread.id, 'الرد الأول');
      await service.markVisitorRead(thread.id, studentId, null);
      await service.reply(thread.id, 'الرد التاني');

      expect((await service.myThreadSummary(studentId, null)).latestFromAyman).toBe('الرد التاني');
    });

    it('carries the newest unread message from him, and drops it once read', async () => {
      /*
       * What «رسالة من م. أيمن» on the dashboard renders. Three properties, and
       * all three are load-bearing:
       *
       *   · it is the NEWEST of his messages, not the first — the card would
       *     otherwise show a student a week-old note every time a new one
       *     arrives;
       *   · it disappears the moment the thread is read, because the card
       *     exists only while something is waiting;
       *   · it is only ever HIS words. A preview of the student's own question
       *     echoed back on their home screen would be nonsense.
       */
      const { thread, guestToken } = await openGuest('+201000000009', 'سؤال الطالب');
      await service.reply(thread.id, 'رد أيمن الأول');
      await service.reply(thread.id, 'رد أيمن التاني');

      const summary = await service.myThreadSummary(null, guestToken);
      expect(summary.latestFromAyman).toBe('رد أيمن التاني');
      expect(summary.latestFromAyman).not.toContain('سؤال الطالب');

      await service.markVisitorRead(thread.id, null, guestToken);
      expect((await service.myThreadSummary(null, guestToken)).latestFromAyman).toBeNull();
    });

    it('truncates the preview rather than shipping a whole message', async () => {
      // It rides on the probe every page load of every route. An outreach
      // message is 400–700 characters and the card shows four lines.
      const { thread, guestToken } = await openGuest('+201000000010');
      await service.reply(thread.id, 'ط'.repeat(1200));

      const preview = (await service.myThreadSummary(null, guestToken)).latestFromAyman!;
      expect(preview.length).toBeLessThanOrEqual(SUMMARY_PREVIEW_MAX + 1);
      expect(preview.endsWith('…')).toBe(true);
    });

    it('still reports a closed thread, but not as an open one', async () => {
      /*
       * Two booleans and not one. `hasThread` is what `?assistant=1` from a
       * reply notification opens onto — it has to survive the instructor
       * closing the conversation, or a notification he answered and then filed
       * links to a page where nothing happens. `hasOpenThread` is what a tap
       * on the launcher lands on instead of the menu, and a finished
       * conversation is not that.
       */
      const { thread, guestToken } = await openGuest('+201000000008');
      await service.setStatus(thread.id, 'closed');

      expect(await service.myThreadSummary(null, guestToken)).toEqual({
        unread: 0,
        hasThread: true,
        hasOpenThread: false,
        latestFromAyman: null,
      });
    });

    it('tells a stranger nothing about anyone else’s thread', async () => {
      // The narrower shape is still an ownership question. A summary that
      // answered from the newest row in the table instead of the caller's
      // would put a dot on a stranger's launcher — and then hand them the
      // thread when they tapped it.
      const { guestToken } = await openGuest();
      const empty = { unread: 0, hasThread: false, hasOpenThread: false, latestFromAyman: null };

      expect(await service.myThreadSummary(null, 'a-token-that-was-never-minted')).toEqual(empty);
      expect(await service.myThreadSummary(null, null)).toEqual(empty);
      expect(await service.myThreadSummary(strangerId, null)).toEqual(empty);
      // …and the real owner still has theirs.
      expect((await service.myThreadSummary(null, guestToken)).hasThread).toBe(true);
    });

    it('never echoes the guest’s phone number back to the visitor', async () => {
      /*
       * A stolen cookie should read a support thread and nothing more. If the
       * phone leaked through this shape it would also be a contact-harvesting
       * primitive, for no benefit — the visitor typed the number and does not
       * need to be told it.
       */
      const { thread } = await openGuest();
      const parsed = ConversationThreadSchema.parse(thread);
      expect(Object.keys(parsed)).not.toContain('guestPhone');
      expect(JSON.stringify(thread)).not.toContain('201000000001');
    });
  });

  describe('reply', () => {
    it('answers, and notifies a signed-in student', async () => {
      const { thread } = await service.open({
        entryPath: ['root'],
        message: 'سؤالي',
        userId: studentId,
        guest: null,
      });
      createdConversations.push(thread.id);

      await service.reply(thread.id, 'وده ردّي');

      const after = await service.myThread(studentId, null);
      expect(after?.status).toBe('answered');
      expect(after?.messages.map((m) => m.author)).toEqual(['visitor', 'admin']);
      // Unread from the visitor's side: the admin message arrived after they
      // last read the thread, which is what puts the dot on the launcher.
      expect(after?.unreadForVisitor).toBe(1);

      const notifications = await prisma.notification.findMany({
        where: { userId: studentId, kind: 'conversation_reply' },
      });
      expect(notifications).toHaveLength(1);
      expect(notifications[0]!.payload).toEqual({ conversationId: thread.id });
    });

    it('notifies nobody when a guest is answered', async () => {
      // There is no account to notify. The guest sees the dot on the launcher
      // instead, which is why `visitorReadAt` is deliberately not touched.
      const { thread, guestToken } = await openGuest();
      await service.reply(thread.id, 'أهلاً');

      const after = await service.myThread(null, guestToken);
      expect(after?.unreadForVisitor).toBe(1);
      expect(await prisma.notification.count({ where: { kind: 'conversation_reply' } })).toBe(0);
    });

    it('puts a thread back to open when the visitor follows up', async () => {
      // Otherwise an answered-then-re-asked thread stays filed under "done"
      // and drops out of the inbox's default filter — silently.
      const { thread, guestToken } = await openGuest();
      await service.reply(thread.id, 'ردّي');
      await service.postMessage(thread.id, null, guestToken, 'سؤال تاني');

      const row = await prisma.conversation.findUniqueOrThrow({
        where: { id: thread.id },
        select: { status: true },
      });
      expect(row.status).toBe('open');
    });

    it('clears the visitor’s unread count once they read it', async () => {
      const { thread, guestToken } = await openGuest();
      await service.reply(thread.id, 'ردّي');
      await service.markVisitorRead(thread.id, null, guestToken);

      const after = await service.myThread(null, guestToken);
      expect(after?.unreadForVisitor).toBe(0);
    });

    it('does not let a stranger’s token mark someone else’s thread read', async () => {
      const { thread, guestToken } = await openGuest();
      await service.reply(thread.id, 'ردّي');
      await service.markVisitorRead(thread.id, null, 'not-the-right-token');

      const row = await prisma.conversation.findUniqueOrThrow({
        where: { id: thread.id },
        select: { visitorReadAt: true },
      });
      // Untouched — `open` leaves this NULL and the call above matched zero
      // rows. Had the ownership filter been dropped from the `updateMany`,
      // this would hold a timestamp instead.
      expect(row.visitorReadAt).toBeNull();

      // And the consequence that actually matters: the real visitor still has
      // their unread dot, rather than a stranger having cleared it for them.
      const owner = await service.myThread(null, guestToken);
      expect(owner?.unreadForVisitor).toBe(1);
    });
  });

  describe('inbox', () => {
    it('counts what still needs an answer, not what is unopened', async () => {
      /*
       * Reading a message is not answering it. A badge keyed on `adminReadAt`
       * would clear the moment he glanced at the inbox and hide exactly the
       * threads he meant to come back to.
       */
      const before = await service.unreadCount();
      const { thread } = await openGuest();
      expect(await service.unreadCount()).toBe(before + 1);

      await service.detail(thread.id); // he LOOKED
      expect(await service.unreadCount()).toBe(before + 1);

      await service.reply(thread.id, 'اتفضل'); // he ANSWERED
      expect(await service.unreadCount()).toBe(before);
    });

    it('truncates the preview server-side', async () => {
      // 40KB of message text shipped to render one line each, twenty rows at a
      // time, is the reason this is cut here and not by CSS.
      const long = 'ط'.repeat(1500);
      const { thread } = await openGuest('+201000000004', long);

      const { rows } = await service.list('open', 'inbox', 50, 0);
      const row = rows.find((entry) => entry.id === thread.id);
      expect(row!.preview.length).toBeLessThan(200);
      expect(row!.preview.endsWith('…')).toBe(true);
    });

    it('shows a guest’s phone but never a student’s', async () => {
      const guest = await openGuest('+201000000005');
      const student = await service.open({
        entryPath: ['root'],
        message: 'من طالب',
        userId: studentId,
        guest: null,
      });
      createdConversations.push(student.thread.id);

      const { rows } = await service.list('open', 'inbox', 50, 0);
      const guestRow = rows.find((entry) => entry.id === guest.thread.id)!;
      const studentRow = rows.find((entry) => entry.id === student.thread.id)!;

      expect(guestRow.isGuest).toBe(true);
      expect(guestRow.guestPhone).toBe('+201000000005');
      expect(studentRow.isGuest).toBe(false);
      // Their number lives on their profile; the inbox must not become a
      // second, staler copy of it.
      expect(studentRow.guestPhone).toBeNull();
      expect(studentRow.who).toBe('طالب المساعد');
    });

    it('marks a thread read when it is opened', async () => {
      const { thread } = await openGuest();
      const detail = await service.detail(thread.id);
      expect(detail.unreadForAdmin).toBe(false);

      const { rows } = await service.list('all', 'inbox', 50, 0);
      expect(rows.find((entry) => entry.id === thread.id)!.unreadForAdmin).toBe(false);
    });

    it('404s an id that does not exist', async () => {
      await expect(
        service.detail('00000000-0000-7000-8000-000000000000'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

/**
 * The rule from the module's header, checked rather than promised.
 *
 * The assistant answers content questions from a hand-written script and from
 * the already-public catalog the web app fetches separately. If this service
 * ever grew a query against `course`, `lesson`, `studentProfile` or
 * `quizAttempt`, the guarantee that a stranger cannot reach unpublished
 * content through the widget would quietly stop being true — and nothing else
 * in the codebase would notice.
 *
 * A recording Proxy stands in for Prisma so this needs no database and no
 * fixtures: it fails on the SHAPE of the code, not on its behaviour.
 */
describe('AssistantService data access', () => {
  const ALLOWED = new Set(['conversation', 'conversationMessage', '$transaction']);

  it('reaches for no Prisma delegate outside its own two tables', async () => {
    const touched = new Set<string>();

    const stub = new Proxy(
      {},
      {
        get(_target, property: string | symbol) {
          if (typeof property !== 'string') return undefined;
          touched.add(property);

          if (property === '$transaction') {
            return (fn: (tx: unknown) => unknown) => fn(stub);
          }
          // Every delegate answers every method with an empty result, which is
          // enough for the calls below to run to completion.
          return new Proxy(
            {},
            {
              get: () => async () => null,
            },
          );
        },
      },
    );

    const service = new AssistantService(
      stub as unknown as PrismaService,
      new NotificationsService(stub as unknown as PrismaService),
    );

    // Exercise every visitor- and admin-side entry point. `findMany` returning
    // null makes some of these throw; what is under test is which delegates
    // were REACHED FOR, so the throws are caught and ignored.
    const calls = [
      () => service.myThread('u1', null),
      () => service.myThread(null, 'tok'),
      () => service.myThreadSummary('u1', null),
      () => service.postMessage('c1', 'u1', null, 'hi'),
      () => service.markVisitorRead('c1', 'u1', null),
      () => service.list('open', 'inbox', 10, 0),
      () => service.unreadCount(),
      () => service.detail('c1'),
      () => service.reply('c1', 'hi'),
      () => service.setStatus('c1', 'closed'),
      () =>
        service.open({
          entryPath: [],
          message: 'hi',
          userId: 'u1',
          guest: null,
        }),
    ];
    for (const call of calls) {
      await call().catch(() => undefined);
    }

    expect([...touched].filter((name) => !ALLOWED.has(name))).toEqual([]);
    // And prove the harness is actually observing something, so a Proxy that
    // silently stopped recording could not pass this as a vacuous truth.
    expect(touched.has('conversation')).toBe(true);
  });
});
