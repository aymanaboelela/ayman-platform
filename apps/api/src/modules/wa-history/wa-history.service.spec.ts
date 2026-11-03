// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { EMPTY_AUDIENCE, type Audience } from '@ayman/contracts/marketing/campaign';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AudienceService } from '../marketing/audience.service';
import { WaBotIdentityService } from '../wa-bot/wa-bot-identity.service';
import { chattedPhones, studentIdsWithWaChat } from './wa-history.queries';
import { WaHistoryService } from './wa-history.service';

/**
 * Against the real database, like `AudienceService`'s own spec: the merge is
 * SQL (`ON CONFLICT … GREATEST`), the identity match is the inbox's own
 * lookup, and the filters are joins — a mock would only agree with itself.
 *
 * The test process runs with no `TENANT_KEY`, which is Ayman's stack, so
 * `whatsapp.history` is on.
 */
describe('WaHistoryService + the «كلّمني / مكلّمنيش» filters', () => {
  let prisma: PrismaService;
  let service: WaHistoryService;
  let audience: AudienceService;

  const stamp = Date.now();
  const suffix = stamp.toString(36);
  const digits = String(stamp).slice(-7);
  /** History chat, they wrote. */
  const chattedPhone = `+20100${digits}`;
  /** No chat anywhere — the risky one. */
  const silentPhone = `+20101${digits}`;
  /** Wrote AFTER linking — a `wa_chats` row, no history row. */
  const inboxPhone = `+20102${digits}`;
  /** The silent student's father, who did chat. */
  const fatherPhone = `+20103${digits}`;
  /** Nobody on the platform. */
  const strangerPhone = `+20104${digits}`;

  const chattedId = `wah-chat-${suffix}`;
  const silentId = `wah-silent-${suffix}`;
  const inboxId = `wah-inbox-${suffix}`;
  const ids = [chattedId, silentId, inboxId];
  const phones = [chattedPhone, silentPhone, inboxPhone, fatherPhone, strangerPhone];

  function audienceFor(overrides: Partial<Audience>): Audience {
    return { ...EMPTY_AUDIENCE, ...overrides };
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();
    service = new WaHistoryService(prisma, new WaBotIdentityService(prisma));
    audience = new AudienceService(prisma);

    const governorate = await prisma.governorate.findFirstOrThrow();
    const students: [string, string, string | null][] = [
      [chattedId, chattedPhone, null],
      [silentId, silentPhone, fatherPhone],
      [inboxId, inboxPhone, null],
    ];
    for (const [id, phone, father] of students) {
      await prisma.user.create({
        data: { id, name: 'طالب', email: `${id}@t.test`, role: 'student', phoneNumber: phone },
      });
      await prisma.studentProfile.create({
        data: {
          userId: id,
          fullName: `طالب ${id}`,
          gender: 'female',
          phone,
          fatherPhone: father,
          governorateCode: governorate.code,
          year: 2,
        },
      });
    }

    await prisma.waChat.create({
      data: {
        phone: inboxPhone,
        userId: inboxId,
        who: 'student',
        firstMessage: 'أهلاً',
        lastMessage: 'أهلاً',
        messageCount: 1,
      },
    });
  });

  afterAll(async () => {
    await prisma.waHistoryChat.deleteMany({ where: { phone: { in: phones } } });
    await prisma.waChat.deleteMany({ where: { phone: { in: phones } } });
    await prisma.studentProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('stores one row per number, matched the way the inbox matches it', async () => {
    const result = await service.ingest([
      {
        phone: chattedPhone,
        hasChat: true,
        theyWroteToUs: true,
        inboundCount: 4,
        lastMessageAt: '2026-10-01T10:00:00.000Z',
        lastInboundAt: '2026-10-01T09:30:00.000Z',
      },
      // The national spelling folds onto the same E.164 number.
      { phone: `0103${digits}`, hasChat: true, theyWroteToUs: false, inboundCount: 0, lastMessageAt: null, lastInboundAt: null },
      { phone: strangerPhone, hasChat: true, theyWroteToUs: false, inboundCount: 0, lastMessageAt: null, lastInboundAt: null },
      { phone: 'not a phone', hasChat: true, theyWroteToUs: true, inboundCount: 1, lastMessageAt: null, lastInboundAt: null },
    ]);
    expect(result).toEqual({ stored: 3, skipped: 1 });

    const rows = await prisma.waHistoryChat.findMany({ where: { phone: { in: phones } }, orderBy: { phone: 'asc' } });
    const byPhone = new Map(rows.map((row) => [row.phone, row]));
    expect(byPhone.get(chattedPhone)).toMatchObject({ who: 'student', userId: chattedId, theyWrote: true, inboundCount: 4 });
    // A parent's chat carries the CHILD's id, as `wa_chats` does.
    expect(byPhone.get(fatherPhone)).toMatchObject({ who: 'parent', userId: silentId, theyWrote: false });
    expect(byPhone.get(strangerPhone)).toMatchObject({ who: 'lead', userId: null });
    // UTC in, UTC out — not shifted by the process's timezone.
    expect(byPhone.get(chattedPhone)?.lastMessageAt?.toISOString()).toBe('2026-10-01T10:00:00.000Z');
  });

  it('a retried or partial batch only ever adds knowledge', async () => {
    await service.ingest([
      {
        phone: chattedPhone,
        hasChat: true,
        theyWroteToUs: false,
        inboundCount: 2,
        lastMessageAt: '2026-09-01T10:00:00.000Z',
        lastInboundAt: null,
      },
    ]);
    const row = await prisma.waHistoryChat.findUniqueOrThrow({ where: { phone: chattedPhone } });
    expect(row.theyWrote).toBe(true);
    expect(row.inboundCount).toBe(4);
    expect(row.lastMessageAt?.toISOString()).toBe('2026-10-01T10:00:00.000Z');
    expect(row.lastInboundAt?.toISOString()).toBe('2026-10-01T09:30:00.000Z');
  });

  it('a chat is a history row OR an inbox row', async () => {
    const found = await chattedPhones(prisma, [chattedPhone, silentPhone, inboxPhone, fatherPhone]);
    expect([...found].sort()).toEqual([chattedPhone, inboxPhone, fatherPhone].sort());
  });

  it('the students filter judges the student’s OWN number, not a parent’s', async () => {
    const chatted = new Set(await studentIdsWithWaChat(prisma));
    expect(chatted.has(chattedId)).toBe(true);
    expect(chatted.has(inboxId)).toBe(true);
    // Their father chatted; they did not.
    expect(chatted.has(silentId)).toBe(false);
  });

  it('«كلّموني» keeps only numbers with a chat', async () => {
    const resolved = await audience.resolve(audienceFor({ students: true, waHistory: 'chatted' }));
    const got = resolved.recipients.map((r) => r.phone);
    expect(got).toContain(chattedPhone);
    expect(got).toContain(inboxPhone);
    expect(got).not.toContain(silentPhone);
  });

  it('«مكلّمونيش» keeps only numbers without one', async () => {
    const resolved = await audience.resolve(audienceFor({ students: true, waHistory: 'never' }));
    const got = resolved.recipients.map((r) => r.phone);
    expect(got).toContain(silentPhone);
    expect(got).not.toContain(chattedPhone);
    expect(got).not.toContain(inboxPhone);
  });

  it('judges a parent by the parent’s own chat', async () => {
    const resolved = await audience.resolve(audienceFor({ students: false, parents: true, waHistory: 'chatted' }));
    expect(resolved.recipients.map((r) => r.phone)).toContain(fatherPhone);
  });

  it('no axis is no filter', async () => {
    const resolved = await audience.resolve(audienceFor({ students: true }));
    const got = resolved.recipients.map((r) => r.phone);
    expect(got).toEqual(expect.arrayContaining([chattedPhone, silentPhone, inboxPhone]));
  });

  it('summarises what arrived', async () => {
    const summary = await service.summary();
    expect(summary.syncedAt).not.toBeNull();
    expect(summary.chats).toBeGreaterThanOrEqual(4);
    expect(summary.students).toBeGreaterThanOrEqual(1);
    expect(summary.parents).toBeGreaterThanOrEqual(1);
  });
});
