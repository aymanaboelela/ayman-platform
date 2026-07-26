import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Public } from '../../auth/decorators/public.decorator';

export interface NormalisedViolation {
  directive: string;
  blockedUri: string;
  documentUri: string;
  sample: string;
}

/** Long samples are page content; they flood logs and can carry user data. */
const SAMPLE_MAX = 120;
/** Dedupe window. A single broken page otherwise emits thousands of identical reports. */
const DEDUPE_MS = 60_000;
const DEDUPE_MAX_KEYS = 500;

function truncate(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, SAMPLE_MAX) : '';
}

/**
 * Normalises both shapes a browser can send: the legacy `report-uri`
 * single-object body (`{ 'csp-report': {...} }`, still what Safari and
 * Firefox implement) and the newer Reporting API array body (`report-to`,
 * what Chrome sends). `proxy.ts` ships both directives so this endpoint
 * never silently misses violations from any engine.
 */
export function normalise(body: unknown): NormalisedViolation[] {
  const out: NormalisedViolation[] = [];

  if (Array.isArray(body)) {
    for (const entry of body) {
      const report = entry as { type?: string; body?: Record<string, unknown> };
      if (report.type !== 'csp-violation' || !report.body) continue;
      out.push({
        directive: truncate(report.body.effectiveDirective),
        blockedUri: truncate(report.body.blockedURL),
        documentUri: truncate(report.body.documentURL),
        sample: truncate(report.body.sample),
      });
    }
    return out;
  }

  const legacy = (body as { 'csp-report'?: Record<string, unknown> } | null | undefined)?.[
    'csp-report'
  ];
  if (legacy) {
    out.push({
      directive: truncate(legacy['effective-directive'] ?? legacy['violated-directive']),
      blockedUri: truncate(legacy['blocked-uri']),
      documentUri: truncate(legacy['document-uri']),
      sample: truncate(legacy['script-sample']),
    });
  }
  return out;
}

/**
 * Backs Task 8's `Content-Security-Policy-Report-Only` header — "ship
 * report-only with a report endpoint first" only means something if
 * something is listening. `apps/web/proxy.ts` points both `report-uri` and
 * `report-to` at this route.
 */
@Controller('security')
export class CspReportController {
  private readonly seen = new Map<string, number>();

  constructor(@InjectPinoLogger(CspReportController.name) private readonly logger: PinoLogger) {}

  /**
   * Always 204, never 4xx. A report endpoint that returns errors is itself
   * an oracle (tells an attacker which shapes are recognised) and makes
   * browsers retry noisily. Unparseable bodies are dropped silently.
   *
   * Public by necessity: the browser posts these with no credentials, often
   * on a page nobody is signed in to, and cannot attach the CSRF header
   * `CsrfGuard` would otherwise demand — hence the `@Public()` skip there.
   * Throttled hard for the same reason this has to accept anonymous POSTs
   * at all.
   */
  @Public()
  @Throttle({ short: { limit: 20, ttl: seconds(10) } })
  @Post('csp-report')
  @HttpCode(204)
  report(@Body() body: unknown): void {
    const now = Date.now();
    for (const violation of normalise(body)) {
      if (!violation.directive) continue;
      const key = `${violation.directive}|${violation.blockedUri}`;
      const last = this.seen.get(key);
      if (last !== undefined && now - last < DEDUPE_MS) continue;
      if (this.seen.size >= DEDUPE_MAX_KEYS) this.seen.clear();
      this.seen.set(key, now);
      this.logger.warn({ csp: violation }, 'csp violation');
    }
  }
}
