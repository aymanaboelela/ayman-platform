import { Controller, Get } from '@nestjs/common';
import type { Taxonomy } from '@ayman/contracts';
import { TaxonomyService } from './taxonomy.service';

@Controller('taxonomy')
export class TaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  /** Public: the onboarding form needs this before a user exists. */
  @Get()
  get(): Promise<Taxonomy> {
    return this.taxonomy.getTaxonomy();
  }
}
