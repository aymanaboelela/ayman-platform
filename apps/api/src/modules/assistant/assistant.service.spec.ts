// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ConversationThreadSchema,
  parseAssistantTranscript,
} from '@ayman/contracts/assistant/conversation';
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
  let courseId = '';
  const createdConversations: string[] = [];

  /** On the account, so `contactPhone` has something real to resolve to. */
  const studentPhone = '+201000000099';

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

  /**
   * A thread the PLATFORM opened, as `OutreachService.deliver` writes one:
   * `origin: 'outreach'`, one `admin` message, `answered` from birth because
   * the instructor spoke last.
   *
   * Built with Prisma directly rather than through `OutreachService` — this
   * spec constructs `AssistantService` on its own and importing the outreach
   * module here would drag its whole dependency graph in to produce two rows.
   */
  async function outreachThread() {
    const row = await prisma.conversation.create({
      data: {
        origin: 'outreach',
        userId: studentId,
        entryPath: [],
        status: 'answered',
        lastMessageAt: new Date(),
        messages: { create: { author: 'admin', body: 'نتيجتك في الكويز' } },
      },
      select: { id: true },
    });
    createdConversations.push(row.id);
    return row;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    studentId = (
      await prisma.user.create({
        data: {
          id: `asst-${stamp}`,
          name: 'طالب المساعد',
          email: `asst-${stamp}@t.test`,
          phoneNumber: studentPhone,
        },
      })
    ).id;
    strangerId = (
      await prisma.user.create({
        data: { id: `asstx-${stamp}`, name: 'غريب', email: `asstx-${stamp}@t.test` },
      })
    ).id;

    // For the `hasActiveSubscription` badge below — a real `AccessGrant`
    // needs a real course to point at.
    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    courseId = (
      await prisma.course.create({
        data: {
          slug: `asst-course-${stamp}`,
          title: 'كورس المساعد',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 2,
          instructorId: strangerId,
        },
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
    // `AccessGrant.course` cascades, so this also clears any grant a test
    // below created.
    await prisma.course.delete({ where: { id: courseId } });
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

  /**
   * The handoff out of المساعد — «محتاج أشوف الشات كامل عشان أعرف هو سأل على
   * إيه».
   *
   * What is under test here is ORDER, above everything else. Both rows are
   * written by one transaction, and Postgres's `now()` does not advance inside
   * one — so with the column defaults they would share a timestamp and the
   * thread would sort at random. The instructor would then read a machine's
   * transcript as the last thing the student said, on the inbox row and at the
   * top of the thread.
   */
  describe('the assistant transcript', () => {
    const transcript = [
      { role: 'user' as const, text: 'إزاي أشترك؟' },
      { role: 'assistant' as const, text: 'من صفحة الكورس.' },
      { role: 'user' as const, text: 'وده بكام؟' },
    ];

    it('writes the exchange BEFORE the question, and keeps the question last', async () => {
      const { thread } = await service.open({
        entryPath: ['root'],
        message: 'وده بكام بالظبط؟',
        userId: studentId,
        guest: null,
        transcript,
      });
      createdConversations.push(thread.id);

      const rows = await prisma.conversationMessage.findMany({
        where: { conversationId: thread.id },
        orderBy: { createdAt: 'asc' },
        select: { author: true, body: true },
      });

      expect(rows).toHaveLength(2);
      // Authored `visitor`, because the enum has two members — the mark inside
      // the body is what says a machine spoke. See the contract.
      expect(rows.every((row) => row.author === 'visitor')).toBe(true);
      expect(parseAssistantTranscript(rows[0]!.body)).toEqual(transcript);
      expect(rows[1]!.body).toBe('وده بكام بالظبط؟');
    });

    it('shows the QUESTION in the inbox preview, never the transcript', async () => {
      const { thread } = await service.open({
        entryPath: ['root'],
        message: 'سؤال المعاينة',
        userId: studentId,
        guest: null,
        transcript,
      });
      createdConversations.push(thread.id);

      const detail = await service.detail(thread.id);
      expect(detail.preview).toBe('سؤال المعاينة');
      expect(detail.messages).toHaveLength(2);
      expect(parseAssistantTranscript(detail.messages[0]!.body)).not.toBeNull();
    });

    it('lands a SECOND handoff in the thread that already exists', async () => {
      /*
       * المساعد can give up twice in one afternoon. If each one opened its own
       * conversation, the inbox would carry three rows for one exchange and
       * the third would be refused by `MAX_OPEN_PER_IDENTITY` — the student
       * told their question could not be sent because they had asked too many.
       */
      const { thread } = await service.open({
        entryPath: ['root'],
        message: 'أول سؤال',
        userId: studentId,
        guest: null,
        transcript,
      });
      createdConversations.push(thread.id);

      await service.postMessage(thread.id, studentId, null, 'تاني سؤال', [
        { role: 'user', text: 'وإمتى الكتاب يوصل؟' },
      ]);

      const detail = await service.detail(thread.id);
      expect(detail.messages).toHaveLength(4);
      expect(detail.messages.map((message) => message.body)).toEqual([
        expect.stringContaining('إزاي أشترك؟'),
        'أول سؤال',
        expect.stringContaining('وإمتى الكتاب يوصل؟'),
        'تاني سؤال',
      ]);
      // The row still says what he has to answer, not what a machine logged.
      expect(detail.preview).toBe('تاني سؤال');
    });

    it('writes no extra message when there is no chat to carry', async () => {
      const { thread } = await service.open({
        entryPath: ['root'],
        message: 'سؤال من غير محادثة',
        userId: studentId,
        guest: null,
        transcript: [],
      });
      createdConversations.push(thread.id);

      const detail = await service.detail(thread.id);
      expect(detail.messages).toHaveLength(1);
    });

    /*
     * ⚠️ The inbox LIST previews a transcript with the STUDENT'S last turn.
     *
     * A handoff happens ON an answer, so the final turn of a transcript is
     * always المساعد's own paragraph — and the row is labelled
     * `previewAuthor: 'visitor'`. Reading the last turn printed a machine's
     * words under the student's name, in the student's colour, as the thing
     * they had just said.
     *
     * The transcript is dated before the question, so it is normally not the
     * newest row and the preview never reaches it. This test makes it the
     * newest one by hand — which is the only way this is reachable, and
     * exactly the case the function's own comment is about.
     */
    it('previews a transcript with the student’s words, never المساعد’s', async () => {
      const { thread } = await service.open({
        entryPath: ['root'],
        message: 'سؤال المعاينة',
        userId: studentId,
        guest: null,
        transcript: [
          { role: 'user', text: 'الكتاب بكام؟' },
          { role: 'assistant', text: 'الأسعار بتتغيّر وأنا مش شايف الرقم دلوقتي.' },
        ],
      });
      createdConversations.push(thread.id);

      const rows = await prisma.conversationMessage.findMany({
        where: { conversationId: thread.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      await prisma.conversationMessage.update({
        where: { id: rows[0]!.id },
        data: { createdAt: new Date(Date.now() + 60_000) },
      });

      const { rows: listed } = await service.list('all', 50, 0);
      const row = listed.find((entry) => entry.id === thread.id);
      expect(row?.preview).toBe('الكتاب بكام؟');
      expect(row?.previewAuthor).toBe('visitor');
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

    it('returns a long thread oldest-first, however the window fetched it', async () => {
      /*
       * `threadById` takes the LAST N messages, which means the query orders
       * DESCENDING and the result is reversed. Get the reverse wrong and every
       * conversation renders upside down — the panel scrolls to
       * `messages[length - 1]` expecting the newest, and the inbox reads the
       * opening question off `messages[0]`.
       */
      const { thread } = await service.open({
        entryPath: ['root'],
        message: 'الأول',
        userId: studentId,
        guest: null,
      });
      createdConversations.push(thread.id);

      await service.reply(thread.id, 'التاني');
      await service.postMessage(thread.id, studentId, null, 'التالت');
      await service.reply(thread.id, 'الرابع');

      const full = await service.myThread(studentId, null);
      expect(full?.messages.map((message) => message.body)).toEqual([
        'الأول',
        'التاني',
        'التالت',
        'الرابع',
      ]);
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
    it('counts what he has not looked at, and clears when he looks', async () => {
      /*
       * ⚠️ This test asserted the OPPOSITE until 2026-08-18, and the change is
       * the point of the whole slice.
       *
       * The badge counted `status: 'open'`, so a question he had read and
       * decided needed no reply sat in the sidebar number forever and the only
       * way to clear it was to type something. Asked for directly: «لو أنا شفت
       * المحادثة دخلت عليها وبصيت عليها، هيبقى كده أعتبر إنها مقروءة. مش عايز
       * إنها لازم أرد».
       *
       * «محتاجة رد» did not go away — it is still a filter tab, and the thread
       * below is still `open` after he reads it. What changed is that a BADGE
       * on an inbox now means «جديد» rather than «مدين».
       */
      const before = await service.unreadCount();
      const { thread, guestToken } = await openGuest();
      expect(await service.unreadCount()).toBe(before + 1);

      await service.detail(thread.id); // he LOOKED, and that is enough
      expect(await service.unreadCount()).toBe(before);

      // Still unanswered, and still findable as such.
      const open = await service.list('open', 50, 0);
      expect(open.rows.some((row) => row.id === thread.id)).toBe(true);

      // A new message from the student makes it unread again — `adminReadAt`
      // is not cleared, it is COMPARED, so history is never rewritten.
      await service.postMessage(thread.id, null, guestToken!, 'لسه مستني');
      expect(await service.unreadCount()).toBe(before + 1);
    });

    it('never counts an automated message nobody answered', async () => {
      /*
       * The trap this slice had to avoid. The old count was `status: 'open'`,
       * which excluded outreach threads for an ACCIDENTAL reason — they are
       * born `answered`. Keyed on `adminReadAt` with no `INBOX_WHERE`, the
       * badge would count every message the sweeper has ever sent, because
       * `adminReadAt` is null on all of them: a number in the hundreds
       * pointing at a screen that shows none of them.
       */
      const before = await service.unreadCount();
      const sent = await outreachThread();

      expect(await service.unreadCount()).toBe(before);
      const rows = await service.list('all', 50, 0);
      expect(rows.rows.some((row) => row.id === sent.id)).toBe(false);

      // …until the student writes back. That is the one exception he asked
      // for — «إلا بقى لو الشخص كلمني أنا».
      await prisma.conversationMessage.create({
        data: { conversationId: sent.id, author: 'visitor', body: 'شكرا يا مستر' },
      });

      expect(await service.unreadCount()).toBe(before + 1);
      const after = await service.list('all', 50, 0);
      expect(after.rows.some((row) => row.id === sent.id)).toBe(true);
    });

    it('carries the account id so the name can link to the record', async () => {
      const guest = await openGuest('+201000000021');
      const student = await service.open({
        entryPath: ['root'],
        message: 'من طالب',
        userId: studentId,
        guest: null,
      });
      createdConversations.push(student.thread.id);

      const { rows } = await service.list('all', 50, 0);
      expect(rows.find((row) => row.id === student.thread.id)!.userId).toBe(studentId);
      // A guest has no record to open, so the list renders plain text.
      expect(rows.find((row) => row.id === guest.thread.id)!.userId).toBeNull();
    });

    it('puts the number to reach them on the thread, and never on the list', async () => {
      const student = await service.open({
        entryPath: ['root'],
        message: 'من طالب',
        userId: studentId,
        guest: null,
      });
      createdConversations.push(student.thread.id);

      const detail = await service.detail(student.thread.id);
      // Joined live off `users.phone_number` — not a copy stored on the thread.
      expect(detail.contactPhone).toBe(studentPhone);

      // The LIST still shows nothing for a student: twenty rows do not need it,
      // and that is the rule `guestPhone` was written under.
      const { rows } = await service.list('all', 50, 0);
      expect(rows.find((row) => row.id === student.thread.id)!.guestPhone).toBeNull();
    });

    it('reports hasActiveSubscription null for a guest — there is no account to check', async () => {
      const guest = await openGuest('+201000000031');
      const detail = await service.detail(guest.thread.id);
      expect(detail.hasActiveSubscription).toBeNull();
    });

    it('reports false for a signed-in student with no purchase grant', async () => {
      const student = await service.open({
        entryPath: ['root'],
        message: 'من طالب',
        userId: studentId,
        guest: null,
      });
      createdConversations.push(student.thread.id);

      const detail = await service.detail(student.thread.id);
      expect(detail.hasActiveSubscription).toBe(false);
    });

    it('reports true once the student holds a live purchase grant', async () => {
      const grant = await prisma.accessGrant.create({
        data: {
          userId: studentId,
          courseId,
          scope: 'course',
          source: 'purchase',
          validFrom: new Date(),
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const student = await service.open({
        entryPath: ['root'],
        message: 'من طالب',
        userId: studentId,
        guest: null,
      });
      createdConversations.push(student.thread.id);

      const detail = await service.detail(student.thread.id);
      expect(detail.hasActiveSubscription).toBe(true);

      await prisma.accessGrant.delete({ where: { id: grant.id } });
    });

    it('never reports true from a REVOKED or LAPSED grant', async () => {
      const revoked = await prisma.accessGrant.create({
        data: {
          userId: studentId,
          courseId,
          scope: 'course',
          source: 'purchase',
          validFrom: new Date(),
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          revokedAt: new Date(),
        },
      });
      const lapsed = await prisma.accessGrant.create({
        data: {
          userId: studentId,
          courseId,
          scope: 'course',
          source: 'purchase',
          validFrom: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          validUntil: new Date(Date.now() - 1000),
        },
      });

      const student = await service.open({
        entryPath: ['root'],
        message: 'من طالب',
        userId: studentId,
        guest: null,
      });
      createdConversations.push(student.thread.id);

      const detail = await service.detail(student.thread.id);
      expect(detail.hasActiveSubscription).toBe(false);

      await prisma.accessGrant.deleteMany({ where: { id: { in: [revoked.id, lapsed.id] } } });
    });

    it('carries an attachment to both sides, each by its own route', async () => {
      const { thread, guestToken } = await openGuest('+201000000022');
      await service.reply(thread.id, '', {
        storageKey: 'msg/ab/00000000-0000-4000-8000-0000000000ab.pdf',
        filename: 'المحاضرة الأولى.pdf',
        sizeBytes: 2048,
      });

      const detail = await service.detail(thread.id);
      const admin = detail.messages.at(-1)!;
      expect(admin.attachment).toEqual({
        kind: 'document',
        filename: 'المحاضرة الأولى.pdf',
        sizeBytes: 2048,
        // `null` on every kind but `voice` — only a voice note's player reads
        // it, and only a voice note has one to read.
        durationSeconds: null,
        path: `/api/admin/conversations/${thread.id}/messages/${admin.id}/attachment`,
        downloadPath: `/api/admin/conversations/${thread.id}/messages/${admin.id}/attachment?download=1`,
      });

      // The student is handed the VISITOR route. They would get a 403 at the
      // other one, so a serializer that emitted it would ship a broken bubble.
      const visitor = await service.myThread(null, guestToken!);
      expect(visitor!.messages.at(-1)!.attachment!.path).toBe(
        `/api/assistant/conversations/${thread.id}/messages/${admin.id}/attachment`,
      );

      // A caption-less message must not render as a blank row: the list's
      // preview falls back to the filename.
      const { rows } = await service.list('all', 50, 0);
      expect(rows.find((row) => row.id === thread.id)!.preview).toBe('📎 المحاضرة الأولى.pdf');
    });

    it('truncates the preview server-side', async () => {
      // 40KB of message text shipped to render one line each, twenty rows at a
      // time, is the reason this is cut here and not by CSS.
      const long = 'ط'.repeat(1500);
      const { thread } = await openGuest('+201000000004', long);

      const { rows } = await service.list('open', 50, 0);
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

      const { rows } = await service.list('open', 50, 0);
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

      const { rows } = await service.list('all', 50, 0);
      expect(rows.find((entry) => entry.id === thread.id)!.unreadForAdmin).toBe(false);
    });

    /**
     * ⚠️ THE REGRESSION THIS FILE EXISTS TO HOLD DOWN.
     *
     * «هنا بييجي له رسالة واردة، وأصلاً أنا اللي بعتها.» `unreadForAdmin` was
     * `lastMessageAt > adminReadAt` — "something happened since he last
     * looked" — and every message bumps `lastMessageAt`, HIS OWN INCLUDED. So
     * replying put the thread straight back on «غير مقروءة» with his own words
     * as its preview, and the sidebar badge counted it.
     *
     * Both halves are asserted because they are two expressions of one rule in
     * two languages: the row mapper's TypeScript and `unreadWhere`'s SQL. A fix
     * to one that misses the other shows up as a border and a tab disagreeing.
     */
    it('does not mark his OWN reply as unread for him', async () => {
      const { thread } = await openGuest('+201000000021', 'سؤال');

      await service.reply(thread.id, 'رد المهندس');

      const detail = await service.detail(thread.id);
      expect(detail.unreadForAdmin).toBe(false);

      const { rows } = await service.list('all', 50, 0);
      expect(rows.find((entry) => entry.id === thread.id)!.unreadForAdmin).toBe(false);

      // …and the «غير مقروءة» tab — the one the badge counts — must not list it.
      const unread = await service.list('unread', 50, 0);
      expect(unread.rows.map((entry) => entry.id)).not.toContain(thread.id);
    });

    it('marks it unread again the moment the STUDENT answers back', async () => {
      // The other half of the same rule: silencing his own messages must not
      // silence theirs. Without this, the fix above would read as "the inbox is
      // quiet now", which is the worse bug of the two.
      const { thread, guestToken } = await openGuest('+201000000022', 'سؤال');
      await service.reply(thread.id, 'رد المهندس');

      await service.postMessage(thread.id, null, guestToken, 'وبعدين؟');

      const unread = await service.list('unread', 50, 0);
      expect(unread.rows.map((entry) => entry.id)).toContain(thread.id);
    });

    it('sets, replaces and clears the instructor’s emoji', async () => {
      const { thread } = await openGuest('+201000000011', 'سؤال');
      const messageId = thread.messages[0]!.id;

      await service.setReaction(thread.id, messageId, '👍');
      expect((await service.detail(thread.id)).messages[0]!.adminReaction).toBe('👍');

      // Replacing is the same call — WhatsApp allows one per person.
      await service.setReaction(thread.id, messageId, '❤️');
      expect((await service.detail(thread.id)).messages[0]!.adminReaction).toBe('❤️');

      // …and `null` takes it back, which is why the route is a PUT rather than
      // a POST with a DELETE beside it.
      await service.setReaction(thread.id, messageId, null);
      expect((await service.detail(thread.id)).messages[0]!.adminReaction).toBeNull();
    });

    it('refuses to react to a message that belongs to another thread', async () => {
      /*
       * Both ids come from the URL and only the PAIR is meaningful. Written as
       * `updateMany` with the conversation in the WHERE, a message id lifted
       * from someone else's thread matches zero rows — the same
       * ownership-in-the-where rule every other method here follows, and the
       * reason this is not `update({ where: { id } })`.
       */
      const mine = await openGuest('+201000000012', 'بتاعي');
      const theirs = await openGuest('+201000000013', 'بتاعهم');

      await service.setReaction(mine.thread.id, theirs.thread.messages[0]!.id, '👍');

      expect((await service.detail(theirs.thread.id)).messages[0]!.adminReaction).toBeNull();
    });

    it('does not disturb the thread when a reaction lands', async () => {
      // A reaction is not a reply. Bumping `lastMessageAt` would reorder his
      // inbox, and flipping the status would make an unanswered question look
      // answered when he has said nothing.
      const { thread } = await openGuest('+201000000014', 'سؤال');
      const before = await prisma.conversation.findUniqueOrThrow({
        where: { id: thread.id },
        select: { status: true, lastMessageAt: true },
      });

      await service.setReaction(thread.id, thread.messages[0]!.id, '🔥');

      const after = await prisma.conversation.findUniqueOrThrow({
        where: { id: thread.id },
        select: { status: true, lastMessageAt: true },
      });
      expect(after).toEqual(before);
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
      () => service.list('open', 10, 0),
      // `unread` is the one filter whose WHERE is built rather than mapped —
      // it must not reach a delegate the others do not.
      () => service.list('unread', 10, 0),
      () => service.unreadCount(),
      () => service.detail('c1'),
      () => service.reply('c1', 'hi'),
      () =>
        service.reply('c1', '', {
          storageKey: 'msg/ab/00000000-0000-4000-8000-0000000000ab.pdf',
          filename: 'x.pdf',
          sizeBytes: 1,
        }),
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
