import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { CatalogStreamFilterSchema } from '@ayman/contracts/catalog';
import type { CatalogCourseDetail, CatalogList } from '@ayman/contracts/catalog';
import { Public } from '../../auth/decorators/public.decorator';
import { CatalogService } from './catalog.service';

/**
 * The default `short: 10/1s` limit (`app.module.ts`) is sized for a single
 * caller — exactly the wrong shape for these two routes. `next build`
 * statically generates one page per published course
 * (`(site)/courses/[slug]/page.tsx`'s `generateStaticParams`), which fires
 * every `getCatalog()`/`getCourse()` call CONCURRENTLY from Next's build
 * workers, all from one machine/IP. With 37 published courses that blows
 * through 10/s immediately and fails the whole build; more courses make it
 * strictly worse, and it would recur on every real deploy, not just in this
 * dev environment.
 *
 * These two routes are `@Public()` reads of already-public catalog data with
 * no write, no auth, and no per-user state — rate-limiting them at the same
 * budget as login/attempt-write routes protects nothing that matters while
 * breaking a legitimate build-time access pattern. A separate, deliberately
 * generous budget, not a global loosening: every OTHER route (including
 * `GET /api/health`, used as the "ordinary route" control in
 * `catalog-throttle.int-spec.ts`) keeps the default 10/60s/1000-per-hour
 * shape untouched.
 */
const CATALOG_THROTTLE = {
  short: { limit: 300, ttl: seconds(1) },
  medium: { limit: 3000, ttl: seconds(60) },
  long: { limit: 30_000, ttl: seconds(3600) },
};

@Controller('catalog')
@Throttle(CATALOG_THROTTLE)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /**
   * Public: the catalog has to be crawlable and readable before signup.
   *
   * `?stream=general|languages` narrows to مدارس عام / مدارس لغات. Parsed
   * rather than passed through: anything else — including `both`, which is not
   * a filter but the absence of one — becomes `undefined` and returns
   * everything, so a typo'd query string is a full list rather than an empty
   * page that looks like "no courses exist".
   */
  @Public()
  @Get('courses')
  list(@Query('stream') stream?: string): Promise<CatalogList> {
    const parsed = CatalogStreamFilterSchema.safeParse(stream);
    return this.catalog.list(parsed.success ? parsed.data : undefined);
  }

  @Public()
  @Get('courses/:slug')
  one(@Param('slug') slug: string): Promise<CatalogCourseDetail> {
    return this.catalog.findBySlug(slug);
  }
}
