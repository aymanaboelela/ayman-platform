import { AUDIT_ACTIONS } from '@ayman/contracts/admin/audit';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

function toArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Query params arrive as `undefined` when absent, never literally `"null"`
 *  — normalised to `null` here so the service's filter object has one
 *  consistent "not filtering on this" representation. */
const optionalString = (schema: z.ZodType<string>) =>
  schema
    .optional()
    .transform((value) => value ?? null);

export const AuditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(50),
  action: z.preprocess(toArray, z.array(z.enum(AUDIT_ACTIONS))).default([]),
  resourceType: optionalString(z.string().max(80)),
  actorUserId: optionalString(z.string()),
  outcome: optionalString(z.enum(['success', 'failure', 'denied'])),
  from: optionalString(z.string().datetime({ offset: true })),
  to: optionalString(z.string().datetime({ offset: true })),
});

export class AuditListQueryDto extends createZodDto(AuditListQuerySchema) {}
