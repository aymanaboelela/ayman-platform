import type Redis from 'ioredis';
import type { MediaUrlResolver } from '../../common/media/media-url';
import type { PrismaService } from '../../prisma/prisma.service';
import { CampaignRunner } from './campaign-runner.service';
import type { WhatsappDeviceService } from './whatsapp-device.service';

/**
 * The dead-man's switch.
 *
 * ## What this is protecting
 *
 * A campaign ran in 2026-09 in which WhatsApp accepted all seventy-four
 * messages and delivered none. Nothing was red: every send resolved, every row
 * went `sent`, the screen read «٧٤ من ٧٤ · اتبعت · ٠ فشل». It was found by the
 * instructor noticing one grey tick on his own phone, days later.
 *
 * Now that receipts are recorded, their ABSENCE is evidence, and this is the
 * code that acts on it: five messages sitting sent past the grace period with
 * not one device acknowledgement pauses the run.
 *
 * ## Why these tests are shaped the way they are
 *
 * They assert that the campaign is PAUSED, with a reason, and that the next
 * recipient is never reached — not that some private predicate returned true.
 * A guard whose test only proves the mechanism ran is a guard that can be
 * disconnected from its effect without a single test going red, and this
 * codebase has shipped four of those in one sitting before.
 */

const HOUR = 3_600_000;
const NOW = new Date('2026-09-11T18:00:00.000Z');

/** Five sent rows, all this old, none delivered — the blind-send shape. */
function blindProbe(minutesAgo: number, delivered: number[] = []) {
  return Array.from({ length: 5 }, (_, i) => ({
    sentAt: new Date(NOW.getTime() - minutesAgo * 60_000),
    deliveredAt: delivered.includes(i) ? new Date(NOW.getTime() - 60_000) : null,
  }));
}

describe('CampaignRunner — the blind-send breaker', () => {
  const campaign = {
    id: 'campaign-1',
    status: 'running' as const,
    nextSendAt: new Date(NOW.getTime() - HOUR),
    minDelaySeconds: 30,
    maxDelaySeconds: 90,
    batchSize: 30,
    batchPauseMinutes: 10,
    dailyCap: 200,
    windowStartHour: 0,
    windowEndHour: 24,
    sentInBatch: 0,
    sentToday: 0,
    dayKey: '2026-09-11',
    body: 'أهلاً',
    imageAssetId: null,
    linkUrl: null,
  };

  function harness(probe: Array<{ sentAt: Date | null; deliveredAt: Date | null }>) {
    const updateCampaign = jest.fn().mockResolvedValue(campaign);
    const findFirstRecipient = jest.fn().mockResolvedValue(null);
    const send = jest.fn().mockResolvedValue({ messageId: 'M1' });

    const prisma = {
      marketingCampaign: { findFirst: jest.fn().mockResolvedValue(campaign), update: updateCampaign },
      marketingRecipient: {
        findMany: jest.fn().mockResolvedValue(probe),
        findFirst: findFirstRecipient,
        update: jest.fn().mockResolvedValue(undefined),
      },
      marketingOptOut: { findUnique: jest.fn().mockResolvedValue(null) },
      mediaAsset: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const device = {
      enabled: true,
      send,
      status: jest.fn().mockResolvedValue({ state: 'connected' }),
    } as unknown as WhatsappDeviceService;

    // Held on the first take, so `tick()` proceeds; `del` is the release.
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    } as unknown as Redis;

    const mediaUrl = { resolve: (key: string) => `https://media/${key}` } as MediaUrlResolver;

    const runner = new CampaignRunner(prisma, device, redis, mediaUrl);
    return { runner, updateCampaign, findFirstRecipient, send };
  }

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('pauses the campaign, with a reason, when five sends have gone unacknowledged past the grace', async () => {
    const { runner, updateCampaign, send } = harness(blindProbe(20));

    await runner.tick();

    expect(updateCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'campaign-1' },
        data: expect.objectContaining({
          status: 'paused',
          nextSendAt: null,
          pausedReason: expect.stringContaining('ماوصلتش'),
        }),
      }),
    );
    // The point of the exercise: recipient six was never spent.
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps going while the grace period has not elapsed', async () => {
    // Five minutes in. A phone in a lift has not failed to receive anything.
    const { runner, updateCampaign } = harness(blindProbe(5));

    await runner.tick();

    expect(updateCampaign).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'paused' }) }),
    );
  });

  it('keeps going when even one message got through', async () => {
    // One delivery is proof the sender works, so the other four are four
    // students with their phones off — which is a Tuesday, not an incident.
    const { runner, updateCampaign } = harness(blindProbe(20, [3]));

    await runner.tick();

    expect(updateCampaign).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'paused' }) }),
    );
  });

  it('does not pass judgement on fewer than five sends', async () => {
    // Three messages in, the campaign has not yet produced enough evidence to
    // stop on — this is what makes the first few sends the experiment rather
    // than the casualty.
    const { runner, updateCampaign } = harness(blindProbe(20).slice(0, 3));

    await runner.tick();

    expect(updateCampaign).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'paused' }) }),
    );
  });

  it('does nothing at all when the device is not configured', async () => {
    const { runner, updateCampaign } = harness(blindProbe(20));
    // @ts-expect-error — overriding the getter on the mock for this case only.
    runner['device'].enabled = false;

    await runner.tick();

    expect(updateCampaign).not.toHaveBeenCalled();
  });
});
