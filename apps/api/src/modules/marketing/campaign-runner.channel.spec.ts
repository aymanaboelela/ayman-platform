// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { CampaignRunner } from './campaign-runner.service';
import { OutreachService } from '../outreach/outreach.service';
import type { WhatsappDeviceService } from './whatsapp-device.service';

/**
 * ## What this spec is for
 *
 * `channel: 'platform'` is the kind of feature that passes review while doing
 * nothing: every existing test stays green whether the platform leg writes a
 * message or silently falls through, because none of them ever set the column.
 * So each case below asserts the EFFECT — a `ConversationMessage` row that
 * exists or does not — and never merely that a spy was called.
 *
 * Real database, same reasoning as `AudienceService`'s own spec: the thing
 * under test is "did the student end up with the message", and a mocked
 * `conversationMessage.create` would only prove the mock agrees with itself.
 *
 * The WhatsApp device is the one collaborator that IS a stub, because it is
 * the one thing that must not happen for real — it sends to a phone.
 */
describe('CampaignRunner — channel', () => {
  let prisma: PrismaService;
  let runner: CampaignRunner;

  let sent: Array<{ phone: string; text: string }>;
  let deviceEnabled: boolean;

  let instructorId: string;
  let studentId: string;
  let studentPhone: string;
  let guestPhone: string;
  const campaignIds: string[] = [];

  /** `step()` is private, and `tick()` is the only public way in — so the
   *  Redis lock is stubbed to always grant, which is exactly what a single
   *  process on a test database is. */
  const redis = {
    set: async () => 'OK',
    del: async () => 1,
  } as unknown as ConstructorParameters<typeof CampaignRunner>[2];

  async function queue(
    channel: 'whatsapp' | 'platform' | 'both',
    recipients: Array<{ phone: string; userId: string | null }>,
  ): Promise<string> {
    const campaign = await prisma.marketingCampaign.create({
      data: {
        name: `spec ${channel} ${Date.now()}`,
        body: 'ده جروب دفعتك، ادخل عليه.',
        status: 'running',
        channel,
        audience: {},
        // No brakes: the pacing maths is `pacing.spec.ts`'s job, and a window
        // or a batch pause here would make this spec fail at 11pm.
        minDelaySeconds: 5,
        maxDelaySeconds: 5,
        batchSize: 0,
        batchPauseMinutes: 0,
        dailyCap: 1000,
        windowStartHour: 0,
        windowEndHour: 24,
        nextSendAt: new Date(Date.now() - 1000),
      },
      select: { id: true },
    });
    campaignIds.push(campaign.id);

    await prisma.marketingRecipient.createMany({
      data: recipients.map((r, position) => ({
        campaignId: campaign.id,
        phone: r.phone,
        userId: r.userId,
        name: 'طالب',
        position,
      })),
    });
    return campaign.id;
  }

  /** Every message in the student's thread, newest last. */
  async function messagesFor(userId: string): Promise<string[]> {
    const rows = await prisma.conversationMessage.findMany({
      where: { conversation: { userId } },
      orderBy: { createdAt: 'asc' },
      select: { body: true },
    });
    return rows.map((r) => r.body);
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();

    const suffix = Date.now().toString(36);
    studentPhone = `+2012${String(Date.now()).slice(-8)}`;
    guestPhone = `+2015${String(Date.now() + 7).slice(-8)}`;

    instructorId = (
      await prisma.user.create({
        data: {
          id: `run-instr-${suffix}`,
          name: 'مدرّس',
          email: `run-instr-${suffix}@t.test`,
          role: 'admin',
        },
      })
    ).id;
    studentId = (
      await prisma.user.create({
        data: {
          id: `run-stud-${suffix}`,
          name: 'طالب',
          email: `run-stud-${suffix}@t.test`,
          role: 'student',
          phoneNumber: studentPhone,
        },
      })
    ).id;

    sent = [];
    deviceEnabled = true;
    const device = {
      get enabled() {
        return deviceEnabled;
      },
      send: async (input: { phone: string; text: string }) => {
        sent.push({ phone: input.phone, text: input.text });
      },
    } as unknown as WhatsappDeviceService;

    runner = new CampaignRunner(
      prisma,
      device,
      redis,
      { resolve: (key: string) => `https://media.test/${key}` },
      new OutreachService(prisma),
    );
  });

  afterAll(async () => {
    await prisma.marketingRecipient.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.marketingCampaign.deleteMany({ where: { id: { in: campaignIds } } });
    await prisma.conversationMessage.deleteMany({
      where: { conversation: { userId: studentId } },
    });
    await prisma.conversation.deleteMany({ where: { userId: studentId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, instructorId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    sent = [];
    deviceEnabled = true;
    /*
     * Park every campaign this spec has already made.
     *
     * `step()` picks the oldest RUNNING campaign in the whole table, not the
     * one the test just wrote — so a case that deliberately leaves recipients
     * `pending` (the offline `both` one) would otherwise be the campaign the
     * NEXT test's `tick()` drains, and that test would be asserting against a
     * message it never queued. Cost one afternoon; leaving a note.
     */
    await prisma.marketingCampaign.updateMany({
      where: { id: { in: campaignIds } },
      data: { status: 'paused', nextSendAt: null },
    });
    await prisma.conversationMessage.deleteMany({ where: { conversation: { userId: studentId } } });
  });

  it('writes the message into the student thread and sends no WhatsApp', async () => {
    const id = await queue('platform', [{ phone: studentPhone, userId: studentId }]);
    await runner.tick();

    expect(await messagesFor(studentId)).toEqual(['ده جروب دفعتك، ادخل عليه.']);
    expect(sent).toEqual([]);

    const rows = await prisma.marketingRecipient.findMany({
      where: { campaignId: id },
      select: { status: true },
    });
    expect(rows.map((r) => r.status)).toEqual(['sent']);
  });

  it('skips a recipient with no account rather than reporting them sent', async () => {
    // «مفيش حساب على المنصة» — a pasted number or a parent's phone. Reporting
    // it as `sent` would be a lie about the one thing the screen answers.
    const id = await queue('platform', [{ phone: guestPhone, userId: null }]);
    await runner.tick();

    const rows = await prisma.marketingRecipient.findMany({
      where: { campaignId: id },
      select: { status: true, error: true },
    });
    expect(rows[0]?.status).toBe('skipped');
    expect(rows[0]?.error).toContain('مفيش حساب على المنصة');
    expect(sent).toEqual([]);
  });

  it('runs a platform campaign while the WhatsApp device is offline', async () => {
    // The regression this guards: the runner used to return on
    // `!device.enabled` before looking at anything, so the one channel that
    // cannot fail refused to start whenever the one that can was asleep.
    deviceEnabled = false;
    await queue('platform', [{ phone: studentPhone, userId: studentId }]);
    await runner.tick();

    expect(await messagesFor(studentId)).toHaveLength(1);
  });

  it('leaves a `both` campaign untouched while the device is offline', async () => {
    // Half-delivering it would settle the row as `sent` and never retry the
    // WhatsApp copy once the device came back.
    deviceEnabled = false;
    const id = await queue('both', [{ phone: studentPhone, userId: studentId }]);
    await runner.tick();

    expect(await messagesFor(studentId)).toEqual([]);
    const rows = await prisma.marketingRecipient.findMany({
      where: { campaignId: id },
      select: { status: true },
    });
    expect(rows.map((r) => r.status)).toEqual(['pending']);
  });

  it('leaves the thread alone on a whatsapp-only campaign', async () => {
    await queue('whatsapp', [{ phone: studentPhone, userId: studentId }]);
    await runner.tick();

    expect(sent.map((s) => s.phone)).toEqual([studentPhone]);
    expect(await messagesFor(studentId)).toEqual([]);
  });
});
