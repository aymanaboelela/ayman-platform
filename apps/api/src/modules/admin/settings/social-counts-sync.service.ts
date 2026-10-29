import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { isFeatureEnabled } from '../../../common/entitlements';
import { loadEnv } from '../../../config/env';
import { fetchMetaFollowers, MetaSyncError } from './meta-followers';
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
  settings: Pick<SettingsService, 'read' | 'applyAutoCounts'>;
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
    const { changed } = await deps.settings.applyAutoCounts('youtube-sync', {
      youtube: result.kind === 'count' ? result.count : null,
    });
    if (result.kind === 'hidden') {
      logger.warn(`YouTube channel ${result.channelId} hides its subscriber count — not publishing it`);
      return 'hidden';
    }
    if (changed.length > 0) logger.log(`YouTube subscribers synced: ${result.count}`);
    return changed.length > 0 ? 'synced' : 'unchanged';
  } catch (error) {
    logger.warn(`YouTube subscriber sync failed, keeping the last saved figure: ${(error as Error).message}`);
    return 'failed';
  }
}

export type MetaSyncOutcome = 'disabled' | 'no-token' | 'failed' | 'reauthorize' | 'synced' | 'unchanged';

export interface MetaSyncDeps {
  token: string | undefined;
  featureEnabled: () => boolean;
  settings: Pick<SettingsService, 'applyAutoCounts'>;
  fetchImpl?: typeof fetch;
  logger?: Pick<Logger, 'log' | 'warn'>;
}

/**
 * The Facebook Page + linked Instagram sync — same contract as
 * `syncYoutubeSubscribers`: NEVER throws, and every failure leaves the stored
 * figures exactly as they were.
 *
 * A Page with no Instagram business account linked writes Facebook only; an
 * Instagram figure already stored (typed, or synced while the link existed)
 * is left alone, and if it was synced it turns typable again once its stamp
 * ages past `AUTO_SYNC_FRESH_MS`.
 *
 * A dead token (`MetaSyncError.reauthorize`) gets its own warning, worded for
 * whoever reads the log: no retry fixes it, a person has to issue a new one.
 */
export async function syncMetaFollowers(deps: MetaSyncDeps): Promise<MetaSyncOutcome> {
  const logger = deps.logger ?? new Logger('SocialCountsSync');
  if (!deps.featureEnabled()) return 'disabled';
  if (!deps.token) return 'no-token';

  try {
    const result = await fetchMetaFollowers(deps.token, deps.fetchImpl);
    const { changed } = await deps.settings.applyAutoCounts('meta-sync', {
      facebook: result.facebook,
      ...(result.instagram !== null ? { instagram: result.instagram } : {}),
    });
    if (changed.length > 0) {
      logger.log(
        `Meta followers synced: facebook ${result.facebook}` +
          (result.instagram !== null ? `, instagram ${result.instagram}` : ' (no Instagram account linked to the Page)'),
      );
    }
    return changed.length > 0 ? 'synced' : 'unchanged';
  } catch (error) {
    if (error instanceof MetaSyncError && error.reauthorize) {
      logger.warn(
        `The Meta page token needs re-authorizing (${error.message}). Issue a new Page access token, set ` +
          'META_PAGE_TOKEN and redeploy; until then the Facebook/Instagram figures stay as last saved and turn ' +
          'editable by hand in the admin after 3 days.',
      );
      return 'reauthorize';
    }
    logger.warn(`Meta follower sync failed, keeping the last saved figures: ${(error as Error).message}`);
    return 'failed';
  }
}

/**
 * «عدد السوشيال ميديا» — keeps the follower figures current where the stack
 * holds a credential and has the `socialCounts` feature open: YouTube with
 * `YOUTUBE_API_KEY`, the Facebook Page and its linked Instagram account with
 * `META_PAGE_TOKEN`. TikTok stays typed (see `admin/social-counts.ts`).
 *
 * Once a day, plus once a minute after boot so a fresh deploy (or a key just
 * added) does not wait until tomorrow. YouTube: 1 quota unit per run against
 * a free daily allowance of 10,000. Meta: one Graph call per run.
 *
 * The two run one after the other, never together: each is a
 * read-modify-write of the same settings row, and two at once could each
 * write back the other's stale half.
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
  private readonly env = loadEnv(process.env);
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
  async sync(): Promise<{ youtube: YoutubeSyncOutcome; meta: MetaSyncOutcome } | 'busy'> {
    if (this.running) return 'busy';
    this.running = true;
    try {
      const featureEnabled = () => isFeatureEnabled('socialCounts');
      // Both never throw, so a YouTube failure cannot cost the Meta run.
      const youtube = await syncYoutubeSubscribers({
        apiKey: this.env.YOUTUBE_API_KEY,
        featureEnabled,
        settings: this.settings,
        logger: this.logger,
      });
      const meta = await syncMetaFollowers({
        token: this.env.META_PAGE_TOKEN,
        featureEnabled,
        settings: this.settings,
        logger: this.logger,
      });
      return { youtube, meta };
    } finally {
      this.running = false;
    }
  }
}
