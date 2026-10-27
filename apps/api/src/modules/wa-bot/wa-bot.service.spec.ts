// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap,
// so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../../audit/audit.service';
import type { WhatsappDeviceService } from '../marketing/whatsapp-device.service';
import { WaBotIdentityService } from './wa-bot-identity.service';
import { WaBotService } from './wa-bot.service';
import { WaBotSettingsService } from './wa-bot-settings.service';
import { WaBotReplier } from './wa-bot-replier.service';
import type { WaBotBrainService } from './wa-bot-brain.service';
import type { WaBotFactsService } from './wa-bot-facts.service';
import { DEFAULT_BOT_SETTINGS } from '@ayman/contracts/wa-bot/schemas';
import { DEBOUNCE_MS } from './policy';

/**
 * The record and the loop, against the real database: an inbound message
 * becomes a chat that falls due, the replier answers it ONCE however many
 * messages it arrived as, a person's reply silences the bot, a burst mutes
 * it, and a lead that signs up and pays is marked «تم الاشتراك» on its own.
 *
 * The brain is stubbed — its own spec covers what it says. What is under test
 * here is when it is allowed to say anything at all.
 */
describe('WaBotService + WaBotReplier', () => {
  let prisma: PrismaService;
  let chats: WaBotService;
  let replier: WaBotReplier;
  const send = jest.fn(async () => ({ messageId: `out-${send.mock.calls.length}-${Date.now()}` }));
  const compose = jest.fn(async () => ({
    action: 'answer' as const,
    reply: 'دي أسعار الكورسات',
    intents: ['price'],
    reason: null,
    patch: {},
  }));

  const stamp = Date.now();
  const suffix = stamp.toString(36);
  const phone = (n: number) => `+20155${String(stamp + n).slice(-7)}`;
  const LEAD = phone(1);
  const BURST = phone(2);
  const OPT = phone(3);
  const HUMAN = phone(4);
  const CONVERT = phone(5);
  const ALL = [LEAD, BURST, OPT, HUMAN, CONVERT];
  let studentId: string;
  let instructorId: string;
  let courseId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();

    const audit = { record: jest.fn() } as unknown as AuditService;
    const device = { enabled: true, send } as unknown as WhatsappDeviceService;
    const identity = new WaBotIdentityService(prisma);
    const settings = new WaBotSettingsService(prisma, audit);
    const facts = { catalog: async () => ({ courses: [], options: [] }) } as unknown as WaBotFactsService;
    chats = new WaBotService(prisma, identity, device, settings, facts, audit);
    replier = new WaBotReplier(
      prisma,
      { compose } as unknown as WaBotBrainService,
      settings,
      identity,
      chats,
      device,
    );

    // Quiet hours off, so the suite means the same thing at 2 a.m. in Cairo.
    const data = { ...DEFAULT_BOT_SETTINGS, quietHoursEnabled: false };
    await prisma.waBotSettings.upsert({ where: { id: 1 }, create: { id: 1, data }, update: { data } });

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    instructorId = (
      await prisma.user.create({
        data: { id: `wab-instr-${suffix}`, name: 'مدرّس', email: `wab-instr-${suffix}@t.test`, role: 'admin' },
      })
    ).id;
    courseId = (
      await prisma.course.create({
        data: {
          slug: `wab-${suffix}`,
          title: 'كورس',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 2,
          instructorId,
          requiresGrant: true,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.waChat.deleteMany({ where: { phone: { in: ALL } } });
    await prisma.waBotSettings.deleteMany({ where: { id: 1 } });
    if (studentId) await prisma.paymentSubmission.deleteMany({ where: { userId: studentId } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, instructorId].filter(Boolean) } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    send.mockClear();
    compose.mockClear();
  });

  const at = (base: Date, ms: number) => new Date(base.getTime() + ms);

  it('records a new number as a lead and answers a three-message burst ONCE', async () => {
    const t0 = new Date();
    await chats.recordInbound({ phone: LEAD, text: 'السلام عليكم', name: 'Mona', messageId: `in-a-${suffix}` }, t0);
    await chats.recordInbound({ phone: LEAD, text: 'الكورس', messageId: `in-b-${suffix}` }, at(t0, 1000));
    await chats.recordInbound({ phone: LEAD, text: 'بكام؟', messageId: `in-c-${suffix}` }, at(t0, 2000));

    const chat = await prisma.waChat.findUniqueOrThrow({ where: { phone: LEAD } });
    expect(chat).toMatchObject({ isLead: true, who: 'lead', pushName: 'Mona', messageCount: 3, leadStatus: 'new' });

    // Not yet due: the debounce is still running from the last message.
    await replier.tick(at(t0, 2500));
    expect(send).not.toHaveBeenCalled();

    await replier.tick(at(t0, 2000 + DEBOUNCE_MS + 10));
    expect(send).toHaveBeenCalledTimes(1);
    expect(compose).toHaveBeenCalledWith(expect.objectContaining({ text: 'السلام عليكم\nالكورس\nبكام؟' }));

    const after = await prisma.waChat.findUniqueOrThrow({ where: { phone: LEAD } });
    expect(after.intents).toEqual(['price']);
    expect(after.botRepliesToday).toBe(1);
    expect(await prisma.waChatMessage.count({ where: { chatId: after.id, handled: false } })).toBe(0);
  });

  it('records a relayed message once, however many times the sidecar sends it', async () => {
    await chats.recordInbound({ phone: LEAD, text: 'بكام؟', messageId: `in-c-${suffix}` });
    const chat = await prisma.waChat.findUniqueOrThrow({ where: { phone: LEAD } });
    expect(chat.messageCount).toBe(3);
  });

  it('waits out the 30 s gap before the next reply to the same number', async () => {
    const t0 = new Date();
    await prisma.waChat.update({ where: { phone: LEAD }, data: { lastBotReplyAt: t0 } });
    await chats.recordInbound({ phone: LEAD, text: 'طب والترم؟', messageId: `in-d-${suffix}` }, at(t0, 1000));
    await replier.tick(at(t0, 1000 + DEBOUNCE_MS + 10));
    expect(send).not.toHaveBeenCalled();
    const deferred = await prisma.waChat.findUniqueOrThrow({ where: { phone: LEAD } });
    expect(deferred.replyDueAt?.getTime()).toBe(t0.getTime() + 30_000);

    await replier.tick(at(t0, 30_001));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never answers «قف», and never answers that number again', async () => {
    await chats.recordInbound({ phone: OPT, text: 'قف', messageId: `in-opt-${suffix}` });
    const chat = await prisma.waChat.findUniqueOrThrow({ where: { phone: OPT } });
    expect(chat.optedOutAt).not.toBeNull();
    expect(chat.replyDueAt).toBeNull();

    // They write again; the opt-out list holds the number (the controller
    // writes it there), so the replier skips it.
    await prisma.marketingOptOut.upsert({ where: { phone: OPT }, create: { phone: OPT }, update: {} });
    const t0 = new Date();
    await chats.recordInbound({ phone: OPT, text: 'الكورس بكام', messageId: `in-opt2-${suffix}` }, t0);
    await replier.tick(at(t0, DEBOUNCE_MS + 10));
    expect(send).not.toHaveBeenCalled();
    await prisma.marketingOptOut.deleteMany({ where: { phone: OPT } });
  });

  it('mutes a chat that sends six messages in a minute — the shape of another bot', async () => {
    const t0 = new Date();
    for (let i = 0; i < 6; i += 1) {
      await chats.recordInbound({ phone: BURST, text: `رسالة ${i}`, messageId: `in-burst-${i}-${suffix}` }, at(t0, i * 1000));
    }
    const chat = await prisma.waChat.findUniqueOrThrow({ where: { phone: BURST } });
    expect(chat.mutedUntil?.getTime()).toBeGreaterThan(t0.getTime());
    expect(chat.replyDueAt).toBeNull();
    await replier.tick(at(t0, 60_000));
    expect(send).not.toHaveBeenCalled();
  });

  it('a reply typed on the handset silences the bot and answers the handoff', async () => {
    const t0 = new Date();
    await chats.recordInbound({ phone: HUMAN, text: 'عاوز أكلم حد', messageId: `in-h1-${suffix}` }, t0);
    await prisma.waChat.update({ where: { phone: HUMAN }, data: { needsHuman: true } });
    await chats.recordInbound({ phone: HUMAN, text: 'أهلاً، معاك مين؟', messageId: `in-h2-${suffix}`, fromMe: true }, at(t0, 1000));

    const chat = await prisma.waChat.findUniqueOrThrow({ where: { phone: HUMAN } });
    expect(chat).toMatchObject({ needsHuman: false, leadStatus: 'contacted', replyDueAt: null });
    expect(chat.humanRepliedAt).not.toBeNull();

    // They answer the person; the bot stays out of it for the whole window.
    await chats.recordInbound({ phone: HUMAN, text: 'الكورس بكام', messageId: `in-h3-${suffix}` }, at(t0, 2000));
    await replier.tick(at(t0, 2000 + DEBOUNCE_MS + 10));
    expect(send).not.toHaveBeenCalled();
  });

  it('a message typed on the handset to a number that never wrote is not recorded', async () => {
    await chats.recordInbound({ phone: phone(99), text: 'إزيك', messageId: `in-x-${suffix}`, fromMe: true });
    expect(await prisma.waChat.findUnique({ where: { phone: phone(99) } })).toBeNull();
  });

  it('marks a lead «تم الاشتراك» once that number signs up AND pays — not on sign-up alone', async () => {
    await chats.recordInbound({ phone: CONVERT, text: 'الكورس بكام', messageId: `in-cv-${suffix}` });
    studentId = (
      await prisma.user.create({
        data: { id: `wab-st-${suffix}`, name: 'طالبة', email: `wab-st-${suffix}@t.test`, role: 'student', phoneNumber: CONVERT },
      })
    ).id;

    await chats.sweepConversions();
    let chat = await prisma.waChat.findUniqueOrThrow({ where: { phone: CONVERT } });
    expect(chat.leadStatus).toBe('new');
    expect(chat.userId).toBe(studentId);

    await prisma.paymentSubmission.create({
      data: { userId: studentId, courseId, plan: 'monthly', amountCents: 15000, status: 'approved', senderPhone: '01000000000' },
    });
    await chats.sweepConversions();
    chat = await prisma.waChat.findUniqueOrThrow({ where: { phone: CONVERT } });
    expect(chat.leadStatus).toBe('subscribed');
    expect(chat.convertedAt).not.toBeNull();
    // Still a lead in the history — it is where they came from.
    expect(chat.isLead).toBe(true);
  });

  it('lists leads with the filters the screen sends', async () => {
    const list = await chats.leads({ status: 'subscribed' }, 1, 50);
    expect(list.rows.map((r) => r.phone)).toContain(CONVERT);
    expect(list.rows.map((r) => r.phone)).not.toContain(LEAD);
    expect(list.counts.subscribed).toBeGreaterThanOrEqual(1);
  });
});
