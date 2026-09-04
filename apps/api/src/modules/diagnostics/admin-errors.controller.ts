import { Controller, Get, HttpCode, Param, Patch, Query } from '@nestjs/common';
import {
  ErrorReportFilterSchema,
  type ErrorReportList,
} from '@ayman/contracts/diagnostics';
import { ListQuerySchema } from '@ayman/contracts/admin/list';
import { parseRequest } from '../../common/http/parse-request';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { DiagnosticsService } from './diagnostics.service';

/**
 * `/api/admin/errors` — «إيه اللي بايظ، وإيه سببه».
 *
 * The instructor's answer to a question he previously had no way to ask. Before
 * this, a failure a student saw left one of two traces: a line in the container
 * log that nobody reads until something is already known to be wrong, or — for
 * a client-side render error — nothing at all. The only reporting channel was a
 * student saying so.
 *
 * ## Two permissions
 *
 * Reading the log and declaring something handled are separate, for the reason
 * `permissions.ts` gives for every other pair: a support role that may triage
 * without closing is then one entry in `ROLE_PERMISSIONS` and zero route
 * changes.
 */
@Controller('admin/errors')
export class AdminErrorsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  @RequirePermission('diagnostics:read')
  @Get()
  async list(
    @Query('filter') filter?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ): Promise<ErrorReportList> {
    /*
     * Through the shared schemas rather than `Number(page)`, for the reason the
     * assistant inbox records: these land in Prisma's `take`/`skip`, where a
     * `NaN` from junk input is a driver-level error — a 500 for a malformed
     * request — and an unbounded `perPage` is a free full-table read.
     *
     * `parseRequest` rather than `.parse()`: a ZodError is not an HttpException,
     * so the fail-closed filter turns bad CLIENT input into a 500 — which is
     * both the wrong status and a line in the error log nobody can act on. See
     * `common/http/parse-request.ts`.
     */
    const query = parseRequest(ListQuerySchema, { page, perPage }, 'list query');
    return this.diagnostics.list(
      parseRequest(ErrorReportFilterSchema, filter ?? undefined, 'filter'),
      query.page,
      query.perPage,
    );
  }

  /**
   * Mark handled.
   *
   * There is no DELETE, deliberately. A fault that comes back is worth seeing
   * AS a fault that came back — `record()` clears `resolvedAt` on any fresh
   * occurrence, so a row that reappears carries its whole history and its
   * original `firstSeenAt`. Deleting it would throw away the one fact that
   * distinguishes "fixed" from "fixed twice and still happening".
   */
  @RequirePermission('diagnostics:resolve')
  @Patch(':id/resolve')
  @HttpCode(204)
  async resolve(@Param('id') id: string): Promise<void> {
    await this.diagnostics.setResolved(id, true);
  }

  @RequirePermission('diagnostics:resolve')
  @Patch(':id/reopen')
  @HttpCode(204)
  async reopen(@Param('id') id: string): Promise<void> {
    await this.diagnostics.setResolved(id, false);
  }
}
