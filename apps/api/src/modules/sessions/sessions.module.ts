import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionDeviceService } from './session-device.service';
import { SessionsController } from './sessions.controller';

@Module({
  controllers: [SessionsController],
  providers: [
    // `SessionDeviceService` is typed against the raw generated
    // `PrismaClient`, not `PrismaService`, so it can also be constructed
    // directly in `auth.config.ts` (which has no Nest container and only a
    // hand-built `PrismaClient`) without a second implementation. A
    // `PrismaService` instance satisfies that type via inheritance
    // (`PrismaService extends PrismaClient`), so this factory just forwards
    // Nest's globally-provided instance through.
    {
      provide: SessionDeviceService,
      useFactory: (prisma: PrismaService) => new SessionDeviceService(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [SessionDeviceService],
})
export class SessionsModule {}
