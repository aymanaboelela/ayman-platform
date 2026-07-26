import { Module } from '@nestjs/common';
import { TaxonomyController } from './taxonomy.controller';
import { TaxonomyService } from './taxonomy.service';

@Module({
  controllers: [TaxonomyController],
  providers: [TaxonomyService],
  // Cross-module access happens only through this exports array.
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
