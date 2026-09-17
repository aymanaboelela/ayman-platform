import {
  EditMessageSchema,
  OpenConversationSchema,
  PostMessageSchema,
  ReplySchema,
  SetReactionSchema,
  SetStatusSchema,
} from '@ayman/contracts/assistant/conversation';
import { createZodDto } from 'nestjs-zod';

/**
 * The wire shapes, as Nest DTOs.
 *
 * Every one of these is `.strict()` in the contract, which is what closes mass
 * assignment on the public routes: a body carrying `userId`, `status` or
 * `guestTokenHash` fails validation before the service is called, because
 * none of those are fields these schemas know about.
 */
export class OpenConversationDto extends createZodDto(OpenConversationSchema) {}
export class PostMessageDto extends createZodDto(PostMessageSchema) {}
export class ReplyDto extends createZodDto(ReplySchema) {}
export class SetStatusDto extends createZodDto(SetStatusSchema) {}

/** `PUT …/messages/:messageId/reaction`. `null` clears it. */
export class SetReactionDto extends createZodDto(SetReactionSchema) {}

export class EditMessageDto extends createZodDto(EditMessageSchema) {}
