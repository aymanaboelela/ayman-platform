import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { isFeatureEnabled } from '../../../common/entitlements';
import { loadEnv } from '../../../config/env';
import { SettingsService } from './settings.service';
import { channelLookups, fetchSubscriberCount } from './youtube-subscribers';

/** After boot, long enough for the API to be serving before it spends a request outward. */
const BOOT_DELAY_MS = 60_000;

export type YoutubeSyncOutcome =
  | 'disabled'
  | 'no-key'
  | 'no-channel'
  | 'failed'
  | 'synced'
  | 'unchanged'
  | 'hidden';

export interface YoutubeSyncDeps {
  apiKey: string | undefined;
  featureEnabled: () => boolean;
  settings: Pick<SettingsService, 'read' | 'applyYoutubeSync'>;
  fetchImpl?: typeof fetch;
  logger?: Pick<Logger, 'log' | 'warn'>;
}

/**
 * One sync, as a function of its inputs — the spec drives it with a fake
 * `fetch` and a fake settings store. NEVER throws: every failure is logged as
 * a warning and leaves the stored figure exactly as it was, because the last
 * known count is still the right order of magnitude and an empty row on the
 * landing page is not.
 */
export async function syncYoutubeSubscribers(deps: YoutubeSyncDeps): Promise<YoutubeSyncOutcome> {
  const logger = deps.logger ?? new Logger('SocialCountsSync');
  // Feature first: a stack that never opened «عدد السوشيال ميديا» must not
  // write a figure into a row it will only show once somebody opens it.
  if (!deps.featureEnabled()) return 'disabled';
  if (!deps.apiKey) return 'no-key';

  try {
    const { contact } = await deps.settings.read();
    const lookups = channelLookups(contact.youtube);
    if (lookups.length === 0) return 'no-channel';

    const result = await fetchSubscriberCount(deps.apiKey, lookups, deps.fetchImpl);
    const { changed } = await deps.settings.applyYoutubeSync(result);
    if (result.kind === 'hidden') {
      logger.warn(`YouTube channel ${result.channelId} hides its subscriber count — not publishing it`);
      return 'hidden';
    }
    if (changed) logger.log(`YouTube subscribers synced: ${result.count}`);
    return changed ? 'synced' : 'unchanged';
  } catch (error) {
    logger.warn(`YouTube subscriber sync failed, keeping the last saved figure: ${(error as Error).message}`);
    return 'failed';
  }
}

/**
 * «عدد السوشيال ميديا» — keeps the YouTube subscriber figure current where the
 * stack has `YOUTUBE_API_KEY` and the `socialCounts` feature open. Facebook,
 * Instagram and TikTok stay typed (see `admin/social-counts.ts`).
 *
 * Once a day, plus once a minute after boot so a fresh deploy (or a key just
 * added) does not wait until tomorrow. 1 quota unit per run against a free
 * daily allowance of 10,000.
 *
 * ## The landing page catches up on its own clock
 *
 * The admin save expires `settings('socialCounts')` from a Next server action
 * (`updateSocialCountsAction`). The API has no way to do that: there is no
 * API→web revalidation hook anywhere in the platform, and writing Next's tag
 * manifest in Redis from here would couple the API to the cache handler's
 * private format. So a synced figure reaches the landing page when
 * `getSocialCounts()`'s `cacheLife('hours')` lapses — hours late on a number
 * that is refreshed daily and rounded to three figures anyway.
 */
@Injectable()
export class SocialCountsSyncService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SocialCountsSyncService.name);
  private readonly apiKey = loadEnv(process.env).YOUTUBE_API_KEY;
  private bootTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly settings: SettingsService) {}

  onApplicationBootstrap(): void {
    // Specs boot the app module; a timer there would reach out to YouTube.
    if (process.env.NODE_ENV === 'test') return;
    this.bootTimer = setTimeout(() => void this.sync(), BOOT_DELAY_MS);
    this.bootTimer.unref();
  }

  onApplicationShutdown(): void {
    if (this.bootTimer) clearTimeout(this.bootTimer);
  }

  /** 05:17 Cairo — off the hour, away from the other daily jobs at 03:00 and 10:00. */
  @Cron('17 5 * * *', { timeZone: 'Africa/Cairo' })
  async sync(): Promise<YoutubeSyncOutcome> {
    if (this.running) return 'unchanged';
    this.running = true;
    try {
      return await syncYoutubeSubscribers({
        apiKey: this.apiKey,
        featureEnabled: () => isFeatureEnabled('socialCounts'),
        settings: this.settings,
        logger: this.logger,
      });
    } finally {
      this.running = false;
    }
  }
}
