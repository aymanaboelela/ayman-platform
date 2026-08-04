// This spec needs `APP_URL` on process.env before `CsrfGuard`'s constructor
// runs `loadEnv`. `.env` (git-ignored, local dev) already sets it, same
// precedent as every other e2e spec in this repo.
import 'dotenv/config';
import { Controller, Get, type INestApplication, Module, Patch, Post } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Public } from '../../auth/decorators/public.decorator';
import { CsrfGuard } from './csrf.guard';
import { RequireCsrf } from './require-csrf.decorator';

@Controller('test')
class FixtureController {
  @Get('read')
  read(): { ok: true } {
    return { ok: true };
  }

  @Post('write')
  write(): { ok: true } {
    return { ok: true };
  }

  @Patch('write')
  patch(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @Post('public-write')
  publicWrite(): { ok: true } {
    return { ok: true };
  }

  // المساعد's shape: reachable without a session, but still origin-checked.
  @Public()
  @RequireCsrf()
  @Post('public-write-guarded')
  publicWriteGuarded(): { ok: true } {
    return { ok: true };
  }
}

describe('CsrfGuard', () => {
  let app: INestApplication;
  const appUrl = process.env.APP_URL as string;

  beforeAll(async () => {
    @Module({
      controllers: [FixtureController],
      providers: [Reflector, { provide: APP_GUARD, useClass: CsrfGuard }],
    })
    class FixtureModule {}

    const moduleRef = await Test.createTestingModule({ imports: [FixtureModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('never gates a safe (GET) method, even with no CSRF header', async () => {
    await request(app.getHttpServer()).get('/test/read').expect(200);
  });

  it('rejects a state-changing request with no x-csrf-token header (403)', async () => {
    await request(app.getHttpServer()).post('/test/write').expect(403);
  });

  it('accepts a state-changing request carrying the header, same-origin shaped', async () => {
    await request(app.getHttpServer())
      .post('/test/write')
      .set('x-csrf-token', 'anything-non-empty')
      .set('origin', appUrl)
      .set('sec-fetch-site', 'same-origin')
      .expect(201);
  });

  it('accepts PATCH the same way as POST', async () => {
    await request(app.getHttpServer())
      .patch('/test/write')
      .set('x-csrf-token', '1')
      .expect(200);
  });

  it('rejects a mismatched Origin even with the header present (403)', async () => {
    await request(app.getHttpServer())
      .post('/test/write')
      .set('x-csrf-token', '1')
      .set('origin', 'https://evil.example')
      .expect(403);
  });

  it('rejects a cross-site Sec-Fetch-Site even with the header present (403)', async () => {
    await request(app.getHttpServer())
      .post('/test/write')
      .set('x-csrf-token', '1')
      .set('sec-fetch-site', 'cross-site')
      .expect(403);
  });

  it('accepts an ABSENT Origin/Sec-Fetch-Site (server-to-server callers, e.g. a Next Server Action)', async () => {
    // supertest/superagent do not send Origin/Sec-Fetch-Site by default —
    // this is the "neither header present" shape.
    await request(app.getHttpServer()).post('/test/write').set('x-csrf-token', '1').expect(201);
  });

  it('rejects an empty x-csrf-token header the same as a missing one (403)', async () => {
    await request(app.getHttpServer()).post('/test/write').set('x-csrf-token', '').expect(403);
  });

  it('@Public() routes skip the CSRF check entirely, matching AuthGuard\'s own exemption', async () => {
    await request(app.getHttpServer()).post('/test/public-write').expect(201);
  });

  it(
    'THE cross-site-shaped attack this control exists to stop: a POST with no custom header, ' +
      'a foreign Origin, and Sec-Fetch-Site: cross-site — everything a real cross-site form ' +
      'submission from an attacker page actually produces — is rejected',
    async () => {
      await request(app.getHttpServer())
        .post('/test/write')
        .set('origin', 'https://attacker.example')
        .set('sec-fetch-site', 'cross-site')
        .expect(403);
    },
  );

  describe('@RequireCsrf() on a public route', () => {
    /*
     * `@Public()` used to imply "no CSRF check either", and while every public
     * route was a GET (plus the browser's own CSP report, which cannot carry a
     * custom header) that was indistinguishable from correct. المساعد added
     * public routes that WRITE: without these two behaviours, a page on
     * another origin could make a signed-in student's browser open a support
     * conversation, and the instructor would read words that student never
     * typed.
     */
    it('rejects a public write with no header, where a plain @Public() route would pass', async () => {
      await request(app.getHttpServer()).post('/test/public-write').expect(201);
      await request(app.getHttpServer()).post('/test/public-write-guarded').expect(403);
    });

    it('rejects a public write from another origin', async () => {
      await request(app.getHttpServer())
        .post('/test/public-write-guarded')
        .set('x-csrf-token', 'anything-non-empty')
        .set('origin', 'https://evil.example')
        .expect(403);
    });

    it('accepts a same-origin public write carrying the header', async () => {
      await request(app.getHttpServer())
        .post('/test/public-write-guarded')
        .set('x-csrf-token', 'anything-non-empty')
        .set('origin', appUrl)
        .set('sec-fetch-site', 'same-origin')
        .expect(201);
    });
  });
});
