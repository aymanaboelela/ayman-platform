// Prisma 7 does not auto-load .env, and this spec runs outside Nest's bootstrap.
import 'dotenv/config';
import { randomInt } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { WhatsappDeviceService, SendInput } from '../marketing/whatsapp-device.service';
import { ReferralNoticeService } from './referral-notice.service';

/**
 * «مكافأة الدعوة نزلت» on WhatsApp — the four promises the owner asked for:
 * nothing goes out (and nothing is marked) while no device is linked; once one
 * is, only rewards from the last few days are announced, never a backlog; one
 * notice per referral; and a device that drops mid-send hands the row back.
 */
describe('the referral WhatsApp notice', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let savedProgram: unknown = null;
  let seq = 0;

  const sent: SendInput[] = [];
  const device = {
    state: 'connected' as string,
    fail: null as Error | null,
    enabled: true,
    async status() {
      return { state: this.state, phone: null, qr: null, detail: null };
    },
    async send(input: SendInput) {
      if (this.fail) throw this.fail;
      sent.push(input);
      return { messageId: `m-${sent.length}` };
    },
  };
  const service = new ReferralNoticeService(prisma, device as unknown as WhatsappDeviceService);

  const phone = () => `+2010${String(randomInt(10_000_000, 99_999_999))}`;

  async function user(): Promise<{ id: string; phone: string }> {
    seq += 1;
    const id = `refn-${stamp}-${seq}`;
    const own = phone();
    await prisma.user.create({ data: { id, name: `طالب ${seq}`, email: `${id}@t.test`, phoneNumber: own } });
    return { id, phone: own };
  }

  /** A credited referral, as `reward()` would have left it, `ageMs` ago. */
  async function credited(ageMs: number): Promise<{ id: string; phone: string }> {
    const referrer = await user();
    const friend = await user();
    const row = await prisma.referral.create({
      data: {
        referrerUserId: referrer.id,
        referredUserId: friend.id,
        code: 'ABC234',
        status: 'credited',
        referrerRewardCents: 5_000,
        friendRewardCents: 2_500,
        creditedAt: new Date(Date.now() - ageMs),
      },
    });
    return { id: row.id, phone: referrer.phone };
  }

  const noticeOf = async (id: string) =>
    prisma.referral.findUniqueOrThrow({ where: { id }, select: { noticeAt: true, noticeOutcome: true } });

  beforeAll(async () => {
    await prisma.$connect();
    savedProgram = await prisma.referralProgram.findUnique({ where: { id: 1 } });
    // The notice reads only this switch; the rest of the program is irrelevant here.
    await prisma.referralProgram.upsert({
      where: { id: 1 },
      create: { id: 1, enabled: true, whatsappNotice: true },
      update: { whatsappNotice: true },
    });
    // Rows other specs left credited and un-noticed would ride along; claim
    // them first so this spec reads only its own.
    await prisma.referral.updateMany({
      where: { noticeAt: null, status: 'credited' },
      data: { noticeAt: new Date(), noticeOutcome: 'test-preclaimed' },
    });
  });

  beforeEach(() => {
    sent.length = 0;
    device.state = 'connected';
    device.fail = null;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { startsWith: `refn-${stamp}` } } });
    if (savedProgram) {
      const { id: _id, updatedAt: _at, ...rest } = savedProgram as Record<string, unknown>;
      await prisma.referralProgram.update({ where: { id: 1 }, data: rest as never });
    } else {
      await prisma.referralProgram.deleteMany({ where: { id: 1 } });
    }
    await prisma.$disconnect();
  });

  it('sends nothing and marks nothing while the device is not linked', async () => {
    const row = await credited(60_000);
    device.state = 'disconnected';
    expect(await service.tick()).toBe(0);
    expect(sent).toHaveLength(0);
    expect(await noticeOf(row.id)).toEqual({ noticeAt: null, noticeOutcome: null });
    // Out of the way of the next case, which counts what one tick sends.
    await prisma.referral.update({ where: { id: row.id }, data: { noticeAt: new Date(), noticeOutcome: 'test-done' } });
  });

  it('after linking, announces fresh rewards once — and never the backlog', async () => {
    const fresh = await credited(60 * 60 * 1000);
    const old = await credited(5 * 24 * 60 * 60 * 1000);

    expect(await service.tick()).toBe(1);
    expect(sent.map((input) => input.phone)).toEqual([fresh.phone]);
    expect(sent[0]!.text).toContain('50');
    expect((await noticeOf(fresh.id)).noticeOutcome).toBe('sent');
    // The old one is not marked either: it is simply out of the window.
    expect(await noticeOf(old.id)).toEqual({ noticeAt: null, noticeOutcome: null });

    sent.length = 0;
    expect(await service.tick()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('honours the marketing opt-out list', async () => {
    const row = await credited(60_000);
    await prisma.marketingOptOut.create({ data: { phone: row.phone, reason: 'قف' } });
    try {
      await service.tick();
      expect(sent).toHaveLength(0);
      expect((await noticeOf(row.id)).noticeOutcome).toBe('opted_out');
    } finally {
      await prisma.marketingOptOut.deleteMany({ where: { phone: row.phone } });
    }
  });

  it('hands the row back when the device drops mid-send', async () => {
    const row = await credited(60_000);
    device.fail = new Error('wa /send 503');
    expect(await service.tick()).toBe(0);
    expect(await noticeOf(row.id)).toEqual({ noticeAt: null, noticeOutcome: null });

    device.fail = null;
    expect(await service.tick()).toBe(1);
    expect((await noticeOf(row.id)).noticeOutcome).toBe('sent');
  });

  it('stays silent when the admin switched the notice off', async () => {
    const row = await credited(60_000);
    await prisma.referralProgram.update({ where: { id: 1 }, data: { whatsappNotice: false } });
    try {
      expect(await service.tick()).toBe(0);
      expect(await noticeOf(row.id)).toEqual({ noticeAt: null, noticeOutcome: null });
    } finally {
      await prisma.referralProgram.update({ where: { id: 1 }, data: { whatsappNotice: true } });
    }
  });
});
