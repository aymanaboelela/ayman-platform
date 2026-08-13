import { Body, Controller, HttpCode, Post, Req, UsePipes } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import type { Request } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { OptionalSessionService } from '../../auth/optional-session.service';
import { DiagnosticsService } from './diagnostics.service';
import { ReportErrorDto } from './diagnostics.dto';

/**
 * `/api/errors` — where a browser says "this page failed for me".
 *
 * ## `@Public()`, and it has to be
 *
 * The failures most worth knowing about include the ones a signed-out visitor
 * hits: a course page that throws for someone who arrived from a WhatsApp link
 * is the entire first impression, and it is exactly the case nobody reports by
 * hand. Gating this on a session would log only the failures the instructor was
 * already going to hear about.
 *
 * ## Deliberately NOT `@RequireCsrf()`
 *
 * The assistant's public routes carry it because a forged cross-site POST there
 * writes words into a real student's conversation that the instructor then
 * reads as theirs. Nothing comparable exists here: this endpoint appends to a
 * log nobody is impersonated in, and every field is bounded by the schema.
 *
 * What that does leave open is NOISE — anyone can post — which is what the
 * throttle below is for, and why the row is grouped on a fingerprint rather
 * than appended per call. A flood collapses into one row with a large counter,
 * which is ugly but readable, rather than into a table nobody can open.
 *
 * ## The 204
 *
 * Nothing is returned, and nothing about the response is allowed to matter to
 * the page. This is called from an error boundary — the student is already
 * looking at a failure, and a reporter that could itself fail visibly would be
 * the second one.
 */
@Controller('errors')
export class DiagnosticsController {
  constructor(
    private readonly diagnostics: DiagnosticsService,
    private readonly optionalSession: OptionalSessionService,
  ) {}

  /**
   * Twenty a minute per IP.
   *
   * Generous on purpose. One student on one broken page can legitimately
   * produce several reports in a minute — a boundary reports once per distinct
   * error object, and a retry that fails again is a new one — and the cost of
   * dropping a report is that an outage looks smaller than it is. The ceiling
   * exists for the abusive case, not the failing one.
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @Post()
  @HttpCode(204)
  @UsePipes(ZodValidationPipe)
  async report(@Body() body: ReportErrorDto, @Req() request: Request): Promise<void> {
    // Best-effort: a report from a signed-in student is worth more (it says WHO
    // to go back to), but a missing or expired session must never turn a report
    // into an error — the caller is an error boundary.
    const user = await this.optionalSession.userOrNull(request).catch(() => null);

    await this.diagnostics.record(body, {
      userId: user?.id ?? null,
      // Truncated here rather than in the schema: it is a header, not something
      // the page chose to send, so the client cannot be asked to bound it.
      userAgent: request.get('user-agent')?.slice(0, 400) ?? null,
    });
  }
}
