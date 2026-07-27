// Imported from the `/admin/settings` subpath, not the package root:
// index.ts re-exports through extensionless relative specifiers, which Node's
// native ESM loader cannot resolve at runtime (STANDING HAZARD H3).
import { BrandingSchema, ContactSchema, SeoSchema } from '@ayman/contracts/admin/settings';
import { createZodDto } from 'nestjs-zod';

/**
 * A4/A8: one DTO per section, each `.strict()`, so `forbidNonWhitelisted`
 * semantics come from the schema itself. There is no combined "update all
 * settings" DTO on purpose — a single wide payload is exactly how an unrelated
 * field rides along with a legitimate change.
 */
export class BrandingDto extends createZodDto(BrandingSchema) {}
export class SeoDto extends createZodDto(SeoSchema) {}
export class ContactDto extends createZodDto(ContactSchema) {}
