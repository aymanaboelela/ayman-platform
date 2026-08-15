// Prisma 7 no longer auto-loads .env, and neither does Nest. Load it first,
// before anything reads process.env.
import 'dotenv/config';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  // Validate before the app is constructed so a bad config fails fast and loudly.
  const env = loadEnv(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Better Auth needs the raw body on its routes; disabling the global parser
    // now avoids a breaking change when auth lands in Plan 2.
    bodyParser: false,
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  // The web app proxies /api/* here, so every route is namespaced under /api
  // and the browser only ever sees one origin. No CORS is configured anywhere.
  //
  // A10: media is EXCLUDED from that prefix on purpose. `/api/*` is exactly
  // what the web app's rewrite proxies onto its own origin — if media sat
  // under `/api` too, attacker-uploaded bytes would come back on the app
  // origin through that same rewrite, undoing the whole different-origin
  // control (Task 13).
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'media/:prefix/:name', method: RequestMethod.GET }],
  });

  // A specific hop count, never `true`. With `true`, a client can spoof
  // X-Forwarded-For and become un-throttleable.
  app.set('trust proxy', 1);

  /**
   * ⚠️ Without this, every graceful-shutdown hook in the codebase is DEAD CODE.
   *
   * `RedisModule` implements `OnApplicationShutdown` and `PrismaService`
   * implements `onModuleDestroy`, both written to close their connections
   * cleanly. Nest never calls either unless shutdown hooks are enabled — it
   * does not listen for `SIGTERM` at all by default, so Node's own default
   * handler ends the process immediately.
   *
   * What that costs on every single deploy: the container gets `SIGTERM`, the
   * process dies mid-request, and any student who was submitting an exam
   * answer, saving progress or uploading at that instant gets a dropped
   * connection. Postgres and Redis are left to time the sockets out on their
   * own side.
   *
   * With hooks enabled, Nest stops accepting new connections, waits for the
   * in-flight ones to finish, then runs the two hooks above — which is the
   * difference between a deploy nobody notices and a deploy that loses
   * whatever was in flight.
   *
   * MUST be called before `listen()`: it registers the signal listeners, and a
   * signal arriving in the window between listening and registering would find
   * nothing handling it.
   */
  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
}

void bootstrap();
