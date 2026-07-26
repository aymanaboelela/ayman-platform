// Imported from the leaf subpath, not the package root — the root barrel
// re-exports through extensionless relative specifiers that Node's ESM loader
// cannot resolve at runtime (see packages/contracts/src/index.ts).
import { QuestionInputSchema } from '@ayman/contracts/quiz/question';
import { createZodDto } from 'nestjs-zod';

/**
 * ADMIN-ONLY DTO. There is deliberately no learner-facing question DTO: a
 * student never sends a question shape, only a response. Keeping the two
 * completely separate is what makes "a student PATCHing {fraction: 1}"
 * structurally impossible rather than merely rejected.
 *
 * `QuestionInputSchema` is a `z.discriminatedUnion`, so its parsed output is a
 * union of object types. `class X extends createZodDto(schema)` only
 * typechecks when the base constructor's return type is a single object type
 * (TS2509 otherwise) — every other DTO in this codebase extends because every
 * other schema is a plain `z.object`. Assigning the value instead of
 * extending it sidesteps that TS limitation while still handing Nest's
 * `ZodValidationPipe` the exact same `ZodDto` object (`isZodDto`, `.schema`,
 * `.create`) it expects from `@Body() body: CreateQuestionDto`.
 */
const CreateQuestionDtoClass = createZodDto(QuestionInputSchema);
type CreateQuestionDtoInstance = InstanceType<typeof CreateQuestionDtoClass>;
export { CreateQuestionDtoClass as CreateQuestionDto };
export type CreateQuestionDto = CreateQuestionDtoInstance;

const UpdateQuestionDtoClass = createZodDto(QuestionInputSchema);
type UpdateQuestionDtoInstance = InstanceType<typeof UpdateQuestionDtoClass>;
export { UpdateQuestionDtoClass as UpdateQuestionDto };
export type UpdateQuestionDto = UpdateQuestionDtoInstance;
