import { Controller, Get, Param } from '@nestjs/common';
import type { CatalogCourseDetail, CatalogList } from '@ayman/contracts/catalog';
import { Public } from '../../auth/decorators/public.decorator';
import { CatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** Public: the catalog has to be crawlable and readable before signup. */
  @Public()
  @Get('courses')
  list(): Promise<CatalogList> {
    return this.catalog.list();
  }

  @Public()
  @Get('courses/:slug')
  one(@Param('slug') slug: string): Promise<CatalogCourseDetail> {
    return this.catalog.findBySlug(slug);
  }
}
