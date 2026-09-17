import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionGrantsService } from './permission-grants.service';

/**
 * Its own module, deliberately NOT part of `AuthModule`.
 *
 * `AuthModule` pulls in Better Auth, which is ESM-only and which jest cannot
 * parse — `authorization-matrix.int-spec.ts` says so at its own header and
 * excludes it for exactly that reason. Anything that needs this service would
 * therefore drag the whole integration suite down with it if the service lived
 * next to the guard.
 *
 * It only needs Prisma, so it costs nothing to keep separate, and the
 * separation is what lets the authorization matrix exercise the routes that
 * hand out permissions — the routes where a missing 403 matters most.
 */
@Module({
  imports: [PrismaModule],
  providers: [PermissionGrantsService],
  exports: [PermissionGrantsService],
})
export class PermissionGrantsModule {}
