import { z } from '@ayman/contracts/zod';

/**
 * `/admin/video-watch` — «متابعة التنزيل»: accounts that opened many distinct
 * lectures in one Cairo day, the shape of someone downloading a course
 * rather than watching it. Written by `VideoKeyWatchService` once an account
 * crosses its daily line; one row per account per day.
 *
 * It flags, it does not judge: a student revising before an exam can land
 * here too. Each row carries what staff need to decide — who, which day, how
 * many lectures and which ones, and how many OTHER days the same account was
 * flagged — and links to the student's file, where the account can be
 * suspended if it is what it looks like.
 */

/** One lecture the account opened that day, as staff recognise it. */
export const VideoKeyFlagLectureSchema = z.object({
  lessonTitle: z.string(),
  courseTitle: z.string(),
});
export type VideoKeyFlagLecture = z.infer<typeof VideoKeyFlagLectureSchema>;

export const VideoKeyFlagRowSchema = z.object({
  id: z.uuid(),
  /** `YYYY-MM-DD`, the Cairo day. */
  day: z.string(),
  videos: z.number().int().min(1),
  studentId: z.string(),
  studentName: z.string(),
  phone: z.string().nullable(),
  /** Days this account was flagged in total, this one included. */
  flaggedDays: z.number().int().min(1),
  /** When the last new lecture was added to this row — «آخر مرة». */
  updatedAt: z.iso.datetime(),
  lectures: z.array(VideoKeyFlagLectureSchema),
  /** Videos counted in `videos` that no lesson carries any more (replaced, archived). */
  unresolved: z.number().int().min(0),
});
export type VideoKeyFlagRow = z.infer<typeof VideoKeyFlagRowSchema>;

/** The three numbers above the list. */
export const VideoKeyFlagSummarySchema = z.object({
  today: z.number().int().min(0),
  last7Days: z.number().int().min(0),
  /** Distinct accounts flagged on more than one day — the ones to look at first. */
  repeatAccounts: z.number().int().min(0),
});
export type VideoKeyFlagSummary = z.infer<typeof VideoKeyFlagSummarySchema>;
