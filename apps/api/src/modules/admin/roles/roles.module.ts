import { Module } from '@nestjs/common';
import { PermissionGrantsModule } from '../../../auth/permission-grants.module';
import { RolesController } from './roles.controller';

/**
 * No service of its own — it imports `PermissionGrantsModule`, which is
 * separate from `AuthModule` on purpose: `AuthModule` carries Better Auth,
 * which is ESM-only and which jest cannot parse, so importing it here would
 * take `authorization-matrix.int-spec.ts` down with it. That spec is exactly
 * what has to cover these two routes.
 */
@Module({
  imports: [PermissionGrantsModule],
  controllers: [RolesController],
})
export class RolesModule {}
