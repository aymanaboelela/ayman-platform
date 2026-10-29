import { Controller, Get } from '@nestjs/common';
import type { PublicPromoBanner } from '@ayman/contracts/admin/promo-banners';
import { Public } from '../../auth/decorators/public.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { PromoBannersService } from './promo-banners.service';

/**
 * `GET /api/promo-banners` — what the student dashboard draws.
 *
 * `@Public()` so the web can read it inside a `'use cache'` entry shared by
 * every student — the way it reads `/api/settings/public` — instead of
 * adding one more authenticated per-view request to a page whose comments
 * count them against the `short` throttle. The list is the same for every
 * student; the year audience is applied on the web from the profile the page
 * already holds.
 *
 * Nothing private travels: a picture, an optional title and link, the years
 * and the dates — what any student sees on their own screen anyway.
 * Inactive and ended rows are filtered in SQL, so a draft is unreachable.
 */
@Controller('promo-banners')
@RequireFeature('promoBanners')
export class PromoBannersController {
  constructor(private readonly banners: PromoBannersService) {}

  @Public()
  @Get()
  list(): Promise<PublicPromoBanner[]> {
    return this.banners.listPublic();
  }
}
