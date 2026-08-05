import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { Throttle, seconds } from '@nestjs/throttler';
import type { NewsList, NewsPostDetail } from '@ayman/contracts/news';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { NewsCreateDto, NewsPatchDto, NewsSetPublishedDto } from './news.dto';
import { NewsService } from './news.service';

/**
 * ⚠️ The same throttle reasoning as `CatalogController`, and for the same
 * observed failure: `next build` statically generates one page per published
 * article via `generateStaticParams`, firing every read CONCURRENTLY from one
 * machine. The default `10/1s` budget fails the whole build the moment there
 * are more than ten articles, and it would recur on every deploy.
 *
 * Scoped to the two `@Public()` reads only — the admin routes below keep the
 * default budget, because nothing legitimately calls those in a burst.
 */
const NEWS_THROTTLE = {
  short: { limit: 300, ttl: seconds(1) },
  medium: { limit: 3000, ttl: seconds(60) },
  long: { limit: 30_000, ttl: seconds(3600) },
};

@Controller()
@UsePipes(ZodValidationPipe)
export class NewsController {
  constructor(private readonly news: NewsService) {}

  /** Public: the index. Published only — the service filters in SQL. */
  @Public()
  @Throttle(NEWS_THROTTLE)
  @Get('news')
  listPublic(): Promise<NewsList> {
    return this.news.listPublic();
  }

  /**
   * Public: one article.
   *
   * A draft and a slug that never existed both 404, deliberately — see
   * `findPublicBySlug`.
   */
  @Public()
  @Throttle(NEWS_THROTTLE)
  @Get('news/:slug')
  async onePublic(@Param('slug') slug: string): Promise<NewsPostDetail> {
    const post = await this.news.findPublicBySlug(slug);
    if (!post) throw new NotFoundException();
    return post;
  }

  // ── admin ──────────────────────────────────────────────────────────────

  @RequirePermission('news:read')
  @Get('admin/news')
  listAdmin() {
    return this.news.listAdmin();
  }

  @RequirePermission('news:read')
  @Get('admin/news/:id')
  oneAdmin(@Param('id') id: string) {
    return this.news.findAdminById(id);
  }

  @RequirePermission('news:write')
  @RequireCsrf()
  @Post('admin/news')
  create(@Body() body: NewsCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.news.create(body, user.id);
  }

  @RequirePermission('news:write')
  @RequireCsrf()
  @Patch('admin/news/:id')
  patch(
    @Param('id') id: string,
    @Body() body: NewsPatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.news.patch(id, body, user.id);
  }

  /**
   * `news:publish`, not `news:write` — putting a page on the public internet
   * under the instructor's name is a different authority from editing it.
   */
  @RequirePermission('news:publish')
  @RequireCsrf()
  @Patch('admin/news/:id/published')
  setPublished(
    @Param('id') id: string,
    @Body() body: NewsSetPublishedDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.news.setPublished(id, body.isPublished, user.id);
  }

  @RequirePermission('news:write')
  @RequireCsrf()
  @Delete('admin/news/:id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.news.remove(id, user.id);
    return { ok: true };
  }
}
