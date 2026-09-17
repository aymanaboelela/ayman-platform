import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ListQuerySchema, type ListResponse } from '@ayman/contracts/admin/list';
import {
  FollowUpQuerySchema,
  FollowUpSendAllSchema,
  FollowUpSendSchema,
  IdleQuerySchema,
  SubscribeSendAllSchema,
  SubscribeSendSchema,
  type FollowUpRow,
  type IdleRow,
  type OutreachSendResult,
} from '@ayman/contracts/outreach/follow-up';
import { parseRequest } from '../../common/http/parse-request';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { FollowUpService } from './follow-up.service';

/**
 * `/api/admin/follow-up` — who stopped, who never started, and one button each.
 *
 * ## Two permissions, on purpose
 *
 * Reading is `student:read`: these rows are a view of students and their
 * progress, and every one of them links to a record that same permission
 * already opens. Sending is `conversation:reply` — the authority
 * `AdminInboxController` uses for «putting words on a student's screen» and
 * the one `AdminBroadcastController` reuses for the same act at a larger
 * radius. A support role that may read the queue and not write in the
 * instructor's name is a real role, and this is the split that allows it.
 *
 * ## Why the send routes are here and not on `/admin/outreach`
 *
 * That controller's own header explains at length why it stays read-only: a
 * «send to everyone» button beside an audit of automated messages turns a
 * personal channel into a mailing list in one click. The same argument sent
 * `/admin/broadcast` to its own controller, and it sends these here. The
 * difference from a broadcast is the whole reason these exist: nothing on this
 * screen can be sent to a student who is not in the selection, and the
 * selection is a fact about what they did.
 *
 * ⚠️ Every static route below is declared before any `:id` route would be —
 * Nest matches in declaration order, and a `:id` added later must go under
 * them or `/idle` routes into it. Same note as `AdminOutreachController`.
 */
@Controller('admin/follow-up')
export class AdminFollowUpController {
  constructor(private readonly followUp: FollowUpService) {}

  @RequirePermission('student:read')
  @Get()
  async list(
    @Query('courseId') courseId?: string,
    @Query('year') year?: string,
    @Query('window') window?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ): Promise<ListResponse<FollowUpRow>> {
    // `parseRequest`, never a bare `.parse()` — a ZodError is not an
    // HttpException and the fail-closed filter would turn a typo in the query
    // string into a 500 that blames the server. See `parse-request.ts`.
    const filter = parseRequest(FollowUpQuerySchema, { courseId, year, window }, 'filter');
    const list = parseRequest(ListQuerySchema, { page, perPage }, 'list query');
    return this.followUp.atRisk(filter, list.perPage, (list.page - 1) * list.perPage);
  }

  @RequirePermission('student:read')
  @Get('idle')
  async idle(
    @Query('year') year?: string,
    @Query('reason') reason?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ): Promise<ListResponse<IdleRow>> {
    const filter = parseRequest(IdleQuerySchema, { year, reason }, 'filter');
    const list = parseRequest(ListQuerySchema, { page, perPage }, 'list query');
    return this.followUp.idle(filter, list.perPage, (list.page - 1) * list.perPage);
  }

  /**
   * One student. Answers `{ sent: 0, … }` with everything zero when they are no
   * longer in the selection — which the screen renders as «الطالب لحق نفسه»,
   * not as a failure. A 404 would be wrong: nothing was not found, the world
   * moved between the read and the press, and that is a good outcome.
   */
  @RequirePermission('conversation:reply')
  @Post('send')
  async send(@Body() body: unknown): Promise<OutreachSendResult> {
    const input = parseRequest(FollowUpSendSchema, body, 'send');
    const outcome = await this.followUp.sendFollowUp(input.userId, input.courseId, input.window);
    return single(outcome);
  }

  @RequirePermission('conversation:reply')
  @Post('send-all')
  async sendAll(@Body() body: unknown): Promise<OutreachSendResult> {
    const filter = parseRequest(FollowUpSendAllSchema, body, 'send');
    return this.followUp.sendAllFollowUp(filter);
  }

  @RequirePermission('conversation:reply')
  @Post('subscribe/send')
  async sendSubscribe(@Body() body: unknown): Promise<OutreachSendResult> {
    const input = parseRequest(SubscribeSendSchema, body, 'send');
    return single(await this.followUp.sendSubscribeNudge(input.userId));
  }

  @RequirePermission('conversation:reply')
  @Post('subscribe/send-all')
  async sendAllSubscribe(@Body() body: unknown): Promise<OutreachSendResult> {
    const filter = parseRequest(SubscribeSendAllSchema, body, 'send');
    return this.followUp.sendAllSubscribe(filter);
  }
}

/** One delivery, reported in the same four-number shape as a sweep. */
function single(
  outcome: 'sent' | 'duplicate' | 'capped' | 'no-recipient' | 'not-listed',
): OutreachSendResult {
  return {
    sent: outcome === 'sent' ? 1 : 0,
    duplicate: outcome === 'duplicate' ? 1 : 0,
    capped: outcome === 'capped' ? 1 : 0,
    cooled: 0,
  };
}
