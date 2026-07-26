import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TaxonomyModule } from './modules/taxonomy/taxonomy.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SecurityModule } from './modules/security/security.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { EntitlementModule } from './modules/entitlement/entitlement.module';

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
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: seconds(1), limit: 10 },
        { name: 'medium', ttl: seconds(60), limit: 60 },
        { name: 'long', ttl: seconds(3600), limit: 1000 },
      ],
    }),
    PrismaModule,
    TaxonomyModule,
    ProfileModule,
    SessionsModule,
    SecurityModule,
    AuthModule,
    EntitlementModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
