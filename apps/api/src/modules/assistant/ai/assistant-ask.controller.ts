import { Body, Controller, Post, Req, Res, UsePipes } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import type { Request, Response } from 'express';
import { Public } from '../../../auth/decorators/public.decorator';
import { RequireCsrf } from '../../security/require-csrf.decorator';
import { AssistantAiService } from './assistant-ai.service';
import { AskDto } from './ask.dto';

/**
 * `POST /api/assistant/ask` — the typed question, answered as it is written.
 *
 * ## `@Public()` and `@RequireCsrf()`, for the same reasons as its neighbour
 *
 * A visitor reading the landing page has no session and is exactly who this is
 * for, so the auth guard cannot be the gate. That does not make a forged
 * cross-site POST acceptable — it would spend this platform's tokens from
 * somebody else's page — so the origin check stays on. `assistant.controller.ts`
 * writes out the full argument; it applies here unchanged.
 *
 * ## The response is written by hand
 *
 * `@Res()` without `passthrough`, because Nest's serializer has no shape for
 * "an answer that is still being written". Everything about this handler —
 * the headers, the `data:` framing, the `end()` — exists so the first sentence
 * reaches the browser while the last one is still being generated. There is
 * one `@Sse()` decorator in Nest that would do most of this, and it takes an
 * Observable; the service is an async generator and the abort path below is
 * clearer without an adapter in the middle.
 */

/**
 * Tighter than the message limits next door, and for a different reason.
 *
 * Opening a conversation is rate-limited because it demands a HUMAN's
 * attention. This is rate-limited because every call costs MONEY — so the
 * shape is different: a burst ceiling that stops a stuck client looping, and
 * hourly and ten-minute windows a real student asking real questions will
 * never reach.
 *
 * `short` is deliberately not 1: the widget already refuses to send while an
 * answer is in flight, so the only person a one-per-window burst limit ever
 * catches is somebody who mistyped, corrected it and pressed send again —
 * which is not abuse, and being told «أسئلة كتير في وقت قصير» for it is the
 * product calling a normal correction a violation.
 *
 * ⚠️ The bucket is the SESSION cookie, falling back to the client IP for a
 * visitor who has none — see `common/throttle/request-identity`. So these
 * numbers are per anonymous ADDRESS on the public pages, which is why the
 * ten-minute window is generous enough for a shared school NAT rather than
 * sized for one person.
 */
const ASK_THROTTLE = {
  short: { limit: 2, ttl: seconds(6) },
  medium: { limit: 20, ttl: seconds(600) },
  long: { limit: 60, ttl: seconds(3600) },
};

@Controller('assistant')
export class AssistantAskController {
  constructor(private readonly ai: AssistantAiService) {}

  @Public()
  @RequireCsrf()
  @Throttle(ASK_THROTTLE)
  @UsePipes(ZodValidationPipe)
  @Post('ask')
  async ask(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: AskDto,
  ): Promise<void> {
    /*
     * `no-transform` alongside `no-store`, and `X-Accel-Buffering: no`.
     *
     * Both exist to stop something between here and the browser from being
     * helpful: a proxy that buffers a response until it is complete turns this
     * back into the non-streaming version it was written to replace, and the
     * symptom is not an error — it is a chat that pauses for eight seconds and
     * then pastes a whole paragraph at once. `no-transform` says so to
     * standards-compliant caches, the header says so to nginx, and neither
     * costs anything where nothing is listening.
     */
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();

    /*
     * A closed tab must stop the generation, not just stop reading it.
     *
     * Without this the model keeps writing — and keeps billing — into a socket
     * nobody is holding. `close` fires on a navigation, a refresh, and on the
     * «إيقاف» button, which aborts the fetch from the other side.
     */
    const aborter = new AbortController();
    request.on('close', () => aborter.abort());

    try {
      for await (const event of this.ai.answer(body.question, body.history, aborter.signal)) {
        if (response.writableEnded) break;
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } finally {
      if (!response.writableEnded) response.end();
    }
  }
}
