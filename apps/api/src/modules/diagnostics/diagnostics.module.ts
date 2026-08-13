import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { DiagnosticsController } from './diagnostics.controller';
import { AdminErrorsController } from './admin-errors.controller';
import { DiagnosticsService } from './diagnostics.service';

/**
 * The error log: what broke for a student, and what it was.
 *
 * `AuthModule` for `OptionalSessionService` alone — the public report route
 * wants to know WHO hit a failure when there is a session to read, and must
 * work perfectly when there is not. Nothing here reaches into content,
 * progress or the assistant, and nothing reaches back into this.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DiagnosticsController, AdminErrorsController],
  providers: [DiagnosticsService],
})
export class DiagnosticsModule {}
