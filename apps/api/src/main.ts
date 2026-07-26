// Prisma 7 no longer auto-loads .env, and neither does Nest. Load it first,
// before anything reads process.env.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  // Validate before the app is constructed so a bad config fails fast and loudly.
  const env = loadEnv(process.env);

  const app = await NestFactory.create(AppModule, {
    // Better Auth needs the raw body on its routes; disabling the global parser
    // now avoids a breaking change when auth lands in Plan 2.
    bodyParser: false,
  });

  // The web app proxies /api/* here, so every route is namespaced under /api
  // and the browser only ever sees one origin. No CORS is configured anywhere.
  app.setGlobalPrefix('api');

  await app.listen(env.API_PORT);
}

void bootstrap();
