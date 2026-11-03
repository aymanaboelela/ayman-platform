import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { REDIS } from '../../redis/redis.module';
import { WaContactsService } from './wa-contacts.service';
import { WhatsappDeviceService } from './whatsapp-device.service';

/**
 * The drip for «احفظهم في واتساب». Ten-second ticks; the pacing on the run
 * row decides whether anything happens — the same split as `CampaignRunner`,
 * for the same reason: a redeploy must not be able to reset a fifteen-minute
 * pause to zero.
 *
 * Its own Redis lock, failing closed like the campaign one. The two runners
 * may tick in the same second; the sidecar serialises them on one queue, so
 * the socket still does one thing at a time.
 */

const LOCK_KEY = 'ayman:marketing:wa-contacts';
/** Longer than the 45s contact timeout, so a crashed tick self-heals. */
const LOCK_TTL_MS = 90_000;

@Injectable()
export class WaContactsRunner {
  private readonly logger = new Logger(WaContactsRunner.name);

  constructor(
    private readonly contacts: WaContactsService,
    private readonly device: WhatsappDeviceService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick(): Promise<void> {
    // No sender configured (local development, a stack without WhatsApp):
    // there is nothing a run could do, and no reason to touch Redis.
    if (!this.device.enabled) return;

    let held = false;
    try {
      held = (await this.redis.set(LOCK_KEY, '1', 'PX', LOCK_TTL_MS, 'NX')) === 'OK';
    } catch (error) {
      this.logger.warn({ err: error }, 'wa contacts runner could not take its lock');
      return;
    }
    if (!held) return;

    try {
      await this.contacts.step();
    } catch (error) {
      this.logger.error({ err: error }, 'wa contacts runner tick failed');
    } finally {
      await this.redis.del(LOCK_KEY).catch(() => undefined);
    }
  }
}
