import { Module } from '@nestjs/common';
import { AdminTaxonomyController } from './admin-taxonomy.controller';
import { AdminTaxonomyService } from './admin-taxonomy.service';

@Module({
  controllers: [AdminTaxonomyController],
  providers: [AdminTaxonomyService],
  exports: [AdminTaxonomyService],
})
export class AdminTaxonomyModule {}
