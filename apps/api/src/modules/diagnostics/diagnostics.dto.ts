import { ErrorReportInputSchema } from '@ayman/contracts/diagnostics';
import { createZodDto } from 'nestjs-zod';

/**
 * The one wire shape a browser may post to `/api/errors`.
 *
 * Every field is bounded in the contract — this endpoint is public, so a
 * 40MB stack or a 200KB "message" is a thing that can actually be sent — and
 * `route` is constrained to a pathname so a query string carrying a
 * password-reset token can never be written into the log.
 */
export class ReportErrorDto extends createZodDto(ErrorReportInputSchema) {}
