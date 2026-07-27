import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { trackerFromRequest } from './common/throttle/request-identity';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TaxonomyModule } from './modules/taxonomy/taxonomy.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SecurityModule } from './modules/security/security.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { EnrollmentModule } from './modules/enrollment/enrollment.module';
import { EntitlementModule } from './modules/entitlement/entitlement.module';
import { ProgressModule } from './modules/progress/progress.module';
import { ContentModule } from './modules/content/content.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { PlayerModule } from './modules/player/player.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { QuizModule } from './modules/quiz/quiz.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
        // Anything on this list never reaches a log line, in any environment.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            '*.password',
            '*.token',
            '*.refreshToken',
            '*.client_secret',
          ],
          remove: true,
        },
      },
    }),
    // Layered limits. The in-memory store is per-instance, so this must move to
    // the Redis storage adapter before anything runs more than one replica.
    //
    // `getTracker` is session-keyed rather than IP-keyed — see
    // `./common/throttle/request-identity` for why an IP bucket is actively
    // wrong for a product whose users sit behind school NATs. `trust proxy` is
    // still a hop count (main.ts), never `true`, so the fallback IP cannot be
    // spoofed via X-Forwarded-For.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: seconds(1), limit: 10, getTracker: trackerFromRequest },
        { name: 'medium', ttl: seconds(60), limit: 60, getTracker: trackerFromRequest },
        { name: 'long', ttl: seconds(3600), limit: 1000, getTracker: trackerFromRequest },
      ],
    }),
    // Powers OverdueService's per-minute sweep (Plan 5 Task 12) — a student
    // who closes the laptop mid-attempt still gets graded (or abandoned)
    // instead of sitting `in_progress` forever.
    ScheduleModule.forRoot(),
    PrismaModule,
    // Global: every admin module writes to the hash-chained trail.
    AuditModule,
    TaxonomyModule,
    ProfileModule,
    SessionsModule,
    SecurityModule,
    AuthModule,
    EnrollmentModule,
    EntitlementModule,
    ProgressModule,
    ContentModule,
    CatalogModule,
    PlayerModule,
    DashboardModule,
    QuizModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
