import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CspReportController } from './csp-report.controller';
import { CsrfGuard } from './csrf.guard';

/** Content types real browsers actually send a CSP report as — never `application/json`. */
const ALLOWED_TYPES = new Set(['application/csp-report', 'application/reports+json', 'application/json']);
const MAX_BYTES = 16 * 1024;

interface RequestWithBody extends IncomingMessage {
  body?: unknown;
}

/**
 * `main.ts` bootstraps with `bodyParser: false` (Better Auth needs raw
 * bodies), and `@thallesp/nestjs-better-auth` installs its own JSON/
 * urlencoded parsers for every OTHER route (Task 2) — but only for
 * `application/json`. Real browsers send CSP violation reports as
 * `application/csp-report` (legacy `report-uri`, Safari/Firefox) or
 * `application/reports+json` (Reporting API, Chrome), neither of which that
 * default parser recognises, so this route parses its own body.
 *
 * Hand-rolled against Node's own `http` types rather than importing
 * `express`'s `json()` middleware: `express` is only a TRANSITIVE
 * dependency here (via `@nestjs/platform-express`), and this repo's strict
 * pnpm layout does not resolve phantom imports — same reasoning
 * `auth.guard.ts` already documented for avoiding `fromNodeHeaders`/
 * `express` request types.
 */
function cspReportBodyParser(req: RequestWithBody, res: ServerResponse, next: () => void): void {
  const contentType = (req.headers['content-type'] ?? '').split(';')[0]?.trim() ?? '';
  if (!ALLOWED_TYPES.has(contentType)) {
    next();
    return;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  let done = false;

  req.on('data', (chunk: Buffer) => {
    if (done) return;
    size += chunk.length;
    if (size > MAX_BYTES) {
      done = true;
      req.body = undefined;
      next();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (done) return;
    try {
      const raw = Buffer.concat(chunks).toString('utf8');
      req.body = raw.length > 0 ? JSON.parse(raw) : undefined;
    } catch {
      req.body = undefined;
    }
    next();
  });
}

@Module({
  controllers: [CspReportController],
  providers: [{ provide: APP_GUARD, useClass: CsrfGuard }],
})
export class SecurityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cspReportBodyParser).forRoutes(CspReportController);
  }
}
