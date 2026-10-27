import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  BroadcastAccessSchema,
  BroadcastRequestSchema,
  type BroadcastCourses,
  type BroadcastResponse,
  type BroadcastTarget,
  type RecipientCount,
} from '@ayman/contracts/outreach/broadcast';
import { parseRequest } from '../../common/http/parse-request';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { BroadcastService } from './broadcast.service';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';

/**
 * `/api/admin/broadcast` — the instructor's own words, sent on purpose.
 *
 * Deliberately its own controller, not a new route bolted onto
 * `AdminOutreachController`: that one's header explains in as many words why
 * it stays read-only, and a send button living beside that comment would
 * read as the codebase disagreeing with itself. This is the send button —
 * named for what it is, so nobody mistakes it for the automated system next
 * door.
 *
 * `conversation:reply`: the permission `AdminInboxController` already uses
 * for "the authority to put words on a student's screen". A broadcast is the
 * same authority exercised at a larger radius, not a different one — so a
 * role trusted to answer one student is trusted to write to all of them, and
 * a role that is not gets no separate door in.
 */

/** `?type=all`, `?type=user&userId=…` or `?type=course&courseId=…&monthId=…
 *  &access=…&paidBefore=true` — a query string, not a JSON blob URL-encoded
 *  into one param: the same shapes `BroadcastTargetSchema` describes for the
 *  POST body, just spelled the way a GET actually carries them. */
const TargetQuerySchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('all') }),
    z.object({ type: z.literal('user'), userId: z.string() }),
    z.object({
      type: z.literal('course'),
      courseId: z.uuid(),
      monthId: z.uuid().optional(),
      access: BroadcastAccessSchema.default('any'),
      paidBefore: z.enum(['true', 'false']).default('false'),
    }),
  ])
  .transform((value): BroadcastTarget =>
    value.type === 'course' ? { ...value, paidBefore: value.paidBefore === 'true' } : value,
  );

// الإذاعة بتوصل لكل الطلبة مرة واحدة — فيتشر بتتفتح، مش بتتفترض.
@RequireFeature('broadcast')
@Controller('admin/broadcast')
export class AdminBroadcastController {
  constructor(private readonly broadcast: BroadcastService) {}

  /**
   * How many accounts an `all` or `course` target currently reaches — read BEFORE the
   * confirm dialog lets the admin press send, and by the same query `send`
   * itself resolves, so the number on screen is never a stale guess.
   */
  @RequirePermission('conversation:reply')
  @Get('recipient-count')
  async recipientCount(
    @Query('type') type?: string,
    @Query('userId') userId?: string,
    @Query('courseId') courseId?: string,
    @Query('monthId') monthId?: string,
    @Query('access') access?: string,
    @Query('paidBefore') paidBefore?: string,
  ): Promise<RecipientCount> {
    // `parseRequest`, never a bare `.parse()`: `AllExceptionsFilter` fails
    // closed, a `ZodError` is not an `HttpException`, and a typo in the query
    // string would come back as a 500 and file an error-log entry blaming the
    // server for the caller's input. `query-parse-validation.spec.ts` is the
    // gate, and it postdates the commit this screen was written in.
    const target = parseRequest(
      TargetQuerySchema,
      { type, userId, courseId, monthId: monthId || undefined, access, paidBefore },
      'target',
    );
    return { count: await this.broadcast.recipientCount(target) };
  }

  /** The «طلبة كورس» picker — courses and their curriculum months. */
  @RequirePermission('conversation:reply')
  @Get('courses')
  async courses(): Promise<BroadcastCourses> {
    return { courses: await this.broadcast.courses() };
  }

  @RequirePermission('conversation:reply')
  @Post()
  async send(@Body() body: unknown): Promise<BroadcastResponse> {
    // Same rule as above, and it bites harder here: a broadcast body that
    // fails the contract is almost always an admin who typed nothing, and
    // «حصل خطأ» is a worse answer to that than «الرسالة فاضية».
    const parsed = parseRequest(BroadcastRequestSchema, body, 'broadcast');
    return this.broadcast.send(parsed.target, parsed.body);
  }
}
