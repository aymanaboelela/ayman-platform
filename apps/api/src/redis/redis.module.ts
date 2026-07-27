import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { loadEnv } from '../config/env';

/** Injection token for the single shared Redis connection. */
export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: (): Redis =>
        new Redis(loadEnv(process.env).REDIS_URL, {
          /**
           * Fail closed. ioredis defaults to queueing commands while the
           * connection is down and replaying them on reconnect; for a rate
           * limiter that means every limit silently becomes unlimited for the
           * duration of a Redis outage. Rejecting turns that into a 500, which
           * the global exception filter already handles and which alerts.
           */
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          // Named so `CLIENT LIST` on a shared Redis identifies this service.
          connectionName: 'ayman-api-throttler',
        }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
