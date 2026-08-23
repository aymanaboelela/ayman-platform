import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  BroadcastRequestSchema,
  type BroadcastResponse,
  type BroadcastTarget,
  type RecipientCount,
} from '@ayman/contracts/outreach/broadcast';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { BroadcastService } from './broadcast.service';

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

/** `?type=all` or `?type=user&userId=…` — a query string, not a JSON blob
 *  URL-encoded into one param: this is the same two shapes
 *  `BroadcastTargetSchema` describes for the POST body, just spelled the way
 *  a GET actually carries them. */
const TargetQuerySchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('all') }),
    z.object({ type: z.literal('user'), userId: z.string() }),
  ])
  .transform((value): BroadcastTarget => value);

@Controller('admin/broadcast')
export class AdminBroadcastController {
  constructor(private readonly broadcast: BroadcastService) {}

  /**
   * How many accounts `{ type: 'all' }` currently reaches — read BEFORE the
   * confirm dialog lets the admin press send, and by the same query `send`
   * itself resolves, so the number on screen is never a stale guess.
   */
  @RequirePermission('conversation:reply')
  @Get('recipient-count')
  async recipientCount(
    @Query('type') type?: string,
    @Query('userId') userId?: string,
  ): Promise<RecipientCount> {
    const target = TargetQuerySchema.parse({ type, userId });
    return { count: await this.broadcast.recipientCount(target) };
  }

  @RequirePermission('conversation:reply')
  @Post()
  async send(@Body() body: unknown): Promise<BroadcastResponse> {
    const parsed = BroadcastRequestSchema.parse(body);
    return this.broadcast.send(parsed.target, parsed.body);
  }
}
