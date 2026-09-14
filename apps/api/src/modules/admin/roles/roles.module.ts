import { Module } from '@nestjs/common';
import { AuthModule } from '../../../auth/auth.module';
import { RolesController } from './roles.controller';

/**
 * No service of its own — `PermissionGrantsService` lives in `AuthModule`
 * because the guard's cache is its real consumer, and this module is only the
 * two routes that read and write it.
 */
@Module({
  imports: [AuthModule],
  controllers: [RolesController],
})
export class RolesModule {}
