import { createZodDto } from 'nestjs-zod';
import { HomeworkReviewSchema, HomeworkSubmitSchema, HomeworkWriteSchema } from '@ayman/contracts/homework';

export class SubmitHomeworkDto extends createZodDto(HomeworkSubmitSchema) {}
export class ReviewHomeworkDto extends createZodDto(HomeworkReviewSchema) {}
/** The instructor's own side — the questions, set from the lesson panel. */
export class SetHomeworkDto extends createZodDto(HomeworkWriteSchema) {}
