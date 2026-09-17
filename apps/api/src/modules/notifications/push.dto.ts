import { PushSubscribeSchema, PushUnsubscribeSchema } from '@ayman/contracts/notifications/push';
import { createZodDto } from 'nestjs-zod';

/** Both schemas are `.strict()` — see the contract — which is what closes
 *  mass assignment on these two routes: a body carrying anything beyond
 *  `endpoint`/`keys` fails validation before `PushService` is ever called. */
export class PushSubscribeDto extends createZodDto(PushSubscribeSchema) {}
export class PushUnsubscribeDto extends createZodDto(PushUnsubscribeSchema) {}
