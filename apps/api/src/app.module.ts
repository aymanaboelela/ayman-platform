import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type Redis from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { PrivateCacheInterceptor } from './common/http/private-cache.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { trackerFromRequest } from './common/throttle/request-identity';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { REDIS, RedisModule } from './redis/redis.module';
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
import { NotificationsModule } from './modules/notifications/notifications.module';
import { QuizModule } from './modules/quiz/quiz.module';
import { SettingsModule } from './modules/admin/settings/settings.module';
import { StudentsModule } from './modules/admin/students/students.module';
import { AdminTaxonomyModule } from './modules/admin/taxonomy/admin-taxonomy.module';
import { MediaModule } from './modules/media/media.module';
import { FlagsModule } from './modules/admin/flags/flags.module';
import { NavigationModule } from './modules/admin/navigation/navigation.module';
import { HomeBlocksModule } from './modules/admin/home-blocks/home-blocks.module';
import { NewsModule } from './modules/news/news.module';
import { AuditReadModule } from './modules/admin/audit/audit-read.module';
import { DiagnosticsModule } from './modules/diagnostics/diagnostics.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { CohortAnalyticsModule } from './modules/analytics/analytics.module';

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
    RedisModule,
    // Layered limits, now backed by Redis so the counters are shared across
    // every replica — the in-memory store was per-instance and silently
    // multiplied every limit by the replica count (see
    // src/test/throttler-storage.int-spec.ts for the proof).
    //
    // `getTracker` is session-keyed rather than IP-keyed — see
    // `./common/throttle/request-identity` for why an IP bucket is actively
    // wrong for a product whose users sit behind school NATs. `trust proxy` is
    // still a hop count (main.ts), never `true`, so the fallback IP cannot be
    // spoofed via X-Forwarded-For. Copied forward verbatim from the in-memory
    // config — only `storage` changed — so this swap cannot silently revert
    // the session-keying fix.
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [
          { name: 'short', ttl: seconds(1), limit: 10, getTracker: trackerFromRequest },
          { name: 'medium', ttl: seconds(60), limit: 60, getTracker: trackerFromRequest },
          { name: 'long', ttl: seconds(3600), limit: 1000, getTracker: trackerFromRequest },
        ],
        storage: new ThrottlerStorageRedisService(redis),
      }),
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
    NotificationsModule,
    SettingsModule,
    StudentsModule,
    AdminTaxonomyModule,
    MediaModule,
    FlagsModule,
    NavigationModule,
    HomeBlocksModule,
    NewsModule,
    AuditReadModule,
    AssistantModule,
    DiagnosticsModule,
    CohortAnalyticsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Every non-`@Public()` response gets `Cache-Control: private, no-store`.
    // The API sent no cache header at all, and the analytics CSV exports —
    // full names, governorates, scores — sit on `.csv` paths, an extension
    // Cloudflare caches by default. See the interceptor for the full note.
    { provide: APP_INTERCEPTOR, useClass: PrivateCacheInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
