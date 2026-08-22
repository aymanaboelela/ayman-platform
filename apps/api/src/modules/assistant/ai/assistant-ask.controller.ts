import { Body, Controller, Post, Req, Res, UsePipes } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import type { Request, Response } from 'express';
import type { AskEvent } from '@ayman/contracts/assistant/ask';
import { Public } from '../../../auth/decorators/public.decorator';
import { OptionalSessionService } from '../../../auth/optional-session.service';
import { copy } from '@ayman/contracts/copy';
import { AssistantStudentService } from './assistant-student.service';
import { AssistantQuestionService } from './assistant-question.service';
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
  constructor(
    private readonly ai: AssistantAiService,
    private readonly students: AssistantStudentService,
    private readonly questions: AssistantQuestionService,
    private readonly session: OptionalSessionService,
  ) {}

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
     * Without this the model keeps writing — and, on a paid provider, keeps
     * billing — into a socket nobody is holding. `close` fires on a
     * navigation, a refresh, and on the «إيقاف» button, which aborts the fetch
     * from the other side.
     *
     * ⚠️ ON THE RESPONSE, NEVER ON THE REQUEST. This read
     * `request.on('close')` for a day and it broke the entire feature in a way
     * that produced no error anywhere.
     *
     * `req` is a readable stream, and Node emits `close` on it when the stream
     * is done being read — which for a POST with a parsed JSON body is a few
     * milliseconds after the handler starts, long before the client goes
     * anywhere. So every single question aborted its own model call
     * immediately: the upstream body was destroyed, `reader.read()` returned
     * `done` on the first pull, the provider yielded nothing, and the service's
     * "nothing came back" branch answered from the written corpus instead.
     *
     * Which looked *exactly* like a working feature. Correct Arabic, a real
     * answer, the «أكلّم م. أيمن» card — just never the model, on any
     * question, with a configured key and a clean 200 in the log. The only
     * symptom was that the answers were suspiciously word-for-word identical
     * to the corpus.
     *
     * `res.on('close')` is the signal that actually means the client is gone.
     * It also fires after a NORMAL end, which is why the guard is there: by
     * then the generator has finished and aborting would be a no-op, but a
     * no-op that reads like a mistake.
     */
    const aborter = new AbortController();
    response.on('close', () => {
      if (!response.writableFinished) aborter.abort();
    });

    /*
     * The answer is accumulated as it streams so it can be recorded ONCE at
     * the end — see `AssistantQuestionService`. Kept here rather than in the
     * service because this is the only place that sees every event, including
     * the ones the exam lock writes without calling a model.
     */
    let answered = '';
    let escalated = false;
    /*
     * Per REQUEST, never on the service: two students asking at the same
     * moment must not attribute each other's answers. Stays `null` when the
     * written corpus answered, which is exactly the distinction the admin
     * screen is read for.
     */
    const meta = { provider: null as string | null };

    const write = (event: AskEvent) => {
      if (event.t === 'delta') answered += event.text;
      if (event.t === 'done') escalated = event.escalate;
      if (!response.writableEnded) response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      /*
       * ── WHO IS ASKING ────────────────────────────────────────────────
       *
       * From the SESSION COOKIE and from nowhere else. The body cannot name a
       * student, the schema has no field for one, and this is the only place
       * an identity enters the request — which is what makes «حاجته هو بس»
       * true by construction rather than by instruction.
       */
      const user = await this.session.userOrNull(request);

      /*
       * ── THE EXAM LOCK ────────────────────────────────────────────────
       *
       * «مينفعش هو في كويز أو امتحان يسأل على سؤال في الامتحان… لازم يبقى
       * سيكيوريتي ١٠٠».
       *
       * A prompt rule is not security here — it is a very good habit that a
       * sufficiently clever message can talk around. This is the gate that
       * cannot be talked around: while a paper is open and unsubmitted, the
       * model is NOT CALLED. No question reaches it, so no answer can come
       * back, whatever the question said and however it was framed.
       *
       * The widget already refuses to render on the attempt route
       * (`shouldMountAssistant`), and that is a UI decision a second tab
       * defeats in one keystroke. This is the same rule enforced where it
       * cannot be routed around — and the two are deliberately kept, because
       * one stops the temptation and the other stops the attempt.
       *
       * Covers `overdue` as well as `in_progress`: a sitting past its
       * deadline that the sweeper has not closed yet is still an open paper,
       * and if anything the more attractive moment to ask.
       */
      if (user && (await this.students.isSittingExam(user.id))) {
        write({ t: 'delta', text: copy.assistant.ai.duringExam });
        write({ t: 'done', escalate: false });
        /*
         * Deliberately NOT recorded. The student asked something during an
         * exam and was refused by a fixed line — keeping it would fill the
         * instructor's screen with rows whose answer is always the same
         * sentence, and would quietly build a list of "who opened the chat
         * mid-exam" that nobody asked for and nothing acts on.
         */
        return;
      }

      /*
       * The student's own studying, read through their session. `null` for a
       * visitor, and `null` again if the read fails — a chat that stops
       * working because the dashboard query was slow would be a worse product
       * than one that answers without the personal half.
       */
      const student = user
        ? await this.students.contextFor(user.id).catch(() => null)
        : null;

      for await (const event of this.ai.answer(
        body.question,
        body.history,
        aborter.signal,
        student,
        meta,
      )) {
        if (response.writableEnded) break;
        write(event);
      }

      /*
       * After the answer, never before it. A failed INSERT must not cost the
       * student a reply they have already read — `record` swallows its own
       * errors for the same reason.
       */
      await this.questions.record({
        userId: user?.id ?? null,
        question: body.question,
        answer: answered,
        provider: meta.provider,
        escalated,
      });
    } finally {
      if (!response.writableEnded) response.end();
    }
  }
}
