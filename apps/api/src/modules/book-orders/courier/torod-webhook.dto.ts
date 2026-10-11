import { createZodDto } from 'nestjs-zod';
import { z } from '@ayman/contracts/zod';

/*
 * A field their system may send as a number, a string, or not at all. Their
 * PDF shows `"vision_ID": "2235"` beside `"status_ID": 4` — the types are
 * whatever their serializer felt like — so every field is read leniently and
 * only `sender_UID` and `status_ID`, the two this cannot work without, are
 * required.
 */
const text = z.preprocess(
  (value) => (value === null || value === undefined ? null : String(value).trim() || null),
  z.string().max(500).nullable(),
);

export const TorodWebhookEntrySchema = z.object({
  vision_ID: text.optional(),
  sender_Code: text.optional(),
  sender_UID: z.preprocess((value) => (value === null || value === undefined ? value : String(value).trim()), z.string().min(1).max(100)),
  delivery_Name: text.optional(),
  delivery_Phone: text.optional(),
  status_ID: z.coerce.number().int(),
  status_Name: text.optional(),
  status_Note: text.optional(),
  status_Date: text.optional(),
});
export type TorodWebhookEntry = z.infer<typeof TorodWebhookEntrySchema>;

/**
 * `{ "orders": [ … ] }` as documented — and a bare entry or a bare array too,
 * because «Web Hock» is the whole of their spec for this and a 400 on a shape
 * we could have read is a status update lost — nothing in their spec says
 * they retry.
 */
export const TorodWebhookSchema = z.preprocess(
  (body) => {
    if (Array.isArray(body)) return { orders: body };
    if (body && typeof body === 'object' && !('orders' in body)) return { orders: [body] };
    return body;
  },
  /* Entries are parsed ONE BY ONE in the service, not here: one malformed
     entry must not throw away the twenty good ones beside it. */
  z.object({ orders: z.array(z.unknown()).max(500) }),
);

export class TorodWebhookDto extends createZodDto(TorodWebhookSchema) {}
