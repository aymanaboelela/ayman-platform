import { Module } from '@nestjs/common';
import { SessionsModule } from '../../sessions/sessions.module';
import { StudentHistoryService } from './student-history.service';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  /*
   * ⚠️ `SessionsModule` imported, NOT `SessionDeviceService` listed as a
   * provider here.
   *
   * That service is typed against the raw generated `PrismaClient` rather than
   * `PrismaService`, so it can also be built by hand in `auth.config.ts` where
   * there is no Nest container. Nest cannot resolve that constructor on its
   * own — `SessionsModule` provides it through a factory that forwards the
   * global `PrismaService`, and exports it.
   *
   * Listing the class here instead made Nest try to inject `PrismaClient` by
   * token, which fails at BOOT. Not for this route — for the whole API. Seven
   * CI checks went red together, which is what that looks like from outside.
   */
  imports: [SessionsModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentHistoryService],
  exports: [StudentsService],
})
export class StudentsModule {}
