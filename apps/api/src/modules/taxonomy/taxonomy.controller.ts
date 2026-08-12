import { Controller, Get } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import type { Taxonomy } from '@ayman/contracts';
import { Public } from '../../auth/decorators/public.decorator';
import { TaxonomyService } from './taxonomy.service';

/**
 * The same constant, and the same reasoning, as `CatalogController` and the
 * public half of `SettingsController` — with one addition that is specific to
 * this route and was the thing that actually bit.
 *
 * Carrying no `@Throttle` at all meant this endpoint sat on `app.module.ts`'s
 * defaults: `short` 10/1s, `medium` 60/60s, `long` 1000/3600s. Those are sized
 * for a single caller, and this endpoint does not have single callers. Five
 * signed-in web routes read it server-side (`/dashboard`, `/library`,
 * `/profile`, `/settings/section`, `/onboarding`), and `apps/web`'s
 * server-side `apiGet` forwards no cookie — so `common/throttle/
 * request-identity.ts` falls through to `ip:${request.ip}`. In production Caddy
 * proxies `/api/*` to `127.0.0.1:3300` while the web container reaches the API
 * as `http://api:3300` with no `X-Forwarded-For`, which means every
 * server-side taxonomy read in the WHOLE FLEET shares ONE tracker key. Roughly
 * sixty page views a minute across those routes — a quiet afternoon —
 * exhausted a budget shared by every visitor, and ten concurrent loads in one
 * second exhausted `short` on its own. The web side saw it as `GET
 * /api/taxonomy failed with 429` and, having no error boundary, showed the
 * student Next's bare error page.
 *
 * `apps/web/lib/taxonomy.ts` is the real fix: those reads now go through one
 * cached loader. This is the floor under it, so that a cache miss, a deploy
 * that empties the cache, or the next route that forgets the loader degrades
 * into a slow request rather than a broken screen.
 *
 * The exposure is the same one the catalog and the public settings already
 * accept: an unauthenticated read of public reference data, no write, no
 * per-user state. Nothing else in this module is loosened — there is only this
 * one route.
 */
const TAXONOMY_THROTTLE = {
  short: { limit: 300, ttl: seconds(1) },
  medium: { limit: 3000, ttl: seconds(60) },
  long: { limit: 30_000, ttl: seconds(3600) },
};

@Controller('taxonomy')
@Throttle(TAXONOMY_THROTTLE)
export class TaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  /** Public: the onboarding form needs this before a user exists. */
  @Public()
  @Get()
  get(): Promise<Taxonomy> {
    return this.taxonomy.getTaxonomy();
  }
}
