import { Injectable } from '@nestjs/common';
import { formatCopy } from '@ayman/contracts/format';
import { PrismaService } from '../../../prisma/prisma.service';
import { DashboardService } from '../../dashboard/dashboard.service';

/**
 * What المساعد is allowed to know about the student ASKING — and nothing about
 * anybody else, ever.
 *
 * ## The model is never trusted with the boundary
 *
 * «قوله حاجته هو بس، مش حاجات الطلبة التانيين، حتى لو وداك رقمه».
 *
 * The tempting design is a tool the model can call — `getGrades(studentId)` —
 * and a rule in the prompt telling it to pass only its own id. That design is
 * one clever sentence away from failing, and the failure discloses a named
 * minor's phone number and exam scores to a stranger. There is no prompt good
 * enough to be the only thing standing there.
 *
 * So the model has no tools and no ids. The CONTROLLER resolves the session
 * cookie to a `userId`, this service reads that one student's own data through
 * `DashboardService.forUser(userId)` — an existing, tested, session-scoped
 * read whose every query is keyed on `userId` — and the result is rendered
 * into a block of text that goes into the request beside the question.
 *
 * That makes the guarantee STRUCTURAL rather than behavioural: another
 * student's row is never loaded, never serialised, and never present in the
 * process at the moment the model runs. A perfect jailbreak returns nothing,
 * because there is nothing there to return. «حتى لو وداك رقمه» is not a rule
 * المساعد follows; it is a thing it cannot do.
 *
 * ## What is deliberately absent
 *
 * No question text, no answer keys, no per-question breakdown — `RecentScore`
 * carries a quiz TITLE and a percentage and that is all it is asked for. A
 * student who has sat a paper must not be able to reconstruct it by asking the
 * assistant what they got wrong, and a student who has NOT sat it must not be
 * able to learn anything about it at all.
 *
 * No phone, no email, no governorate, no guardian's number. None of it answers
 * a question a student would ask about their own studying, and every one of
 * them would be sitting in a prompt travelling to a third party.
 */

/** How many courses and scores the block names before it stops. */
const COURSE_LIMIT = 8;
const SCORE_LIMIT = 5;

@Injectable()
export class AssistantStudentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
  ) {}

  /**
   * Is this student sitting an exam RIGHT NOW?
   *
   * `in_progress` and `overdue` both mean "a paper is open and unsubmitted" —
   * `overdue` is a sitting whose deadline has passed and which the sweeper has
   * not yet closed, which is if anything the more dangerous of the two to
   * answer questions during.
   *
   * Counted rather than fetched: the caller needs one bit, and the row carries
   * `quizId`, which is the beginning of a path to the paper's contents that
   * this file has no reason to open.
   */
  async isSittingExam(userId: string): Promise<boolean> {
    const open = await this.prisma.quizAttempt.count({
      where: { userId, state: { in: ['in_progress', 'overdue'] } },
    });
    return open > 0;
  }

  /**
   * The student's own studying, as a block the model can read.
   *
   * `null` when there is nothing to say — a signed-in student with no
   * enrolments and no scores yet. An empty «بيانات الطالب» heading with
   * nothing under it invites a model to fill the silence.
   */
  async contextFor(userId: string): Promise<string | null> {
    const { enrolledCourses, recentScores, continueWatching, pendingExams } =
      await this.dashboard.forUser(userId);

    if (enrolledCourses.length === 0 && recentScores.length === 0) return null;

    const lines: string[] = [];

    if (enrolledCourses.length > 0) {
      lines.push('كورساته:');
      for (const course of enrolledCourses.slice(0, COURSE_LIMIT)) {
        const closed = course.published ? '' : ' — الكورس مقفول مؤقتاً';
        lines.push(
          formatCopy('- {title}: خلّص {done} من {total} درس ({percent}%){closed}', {
            title: course.title,
            done: String(course.completedLessons),
            total: String(course.totalLessons),
            percent: String(Math.round(course.progressPercent)),
            closed,
          }),
        );
      }
    }

    if (continueWatching) {
      lines.push(
        formatCopy('آخر درس وقف عنده: {lesson} (في {course})', {
          lesson: continueWatching.lessonTitle,
          course: continueWatching.courseTitle,
        }),
      );
    }

    /*
     * A course finished except its exam, which the student has not opened at
     * all — see `PendingExamSchema`. This is exactly the "what should I
     * study for" question a student asks المساعد directly, and until this
     * block existed there was nothing in the prompt that could answer it: an
     * unopened exam has no score to appear among `recentScores`, and it is
     * only ever `continueWatching`'s course when that happens to be the one
     * the student most recently touched.
     *
     * No lesson id, matching the rule every block here follows — the title
     * is enough to name it, and an id is the beginning of a path to content
     * this service has no reason to open.
     */
    if (pendingExams.length > 0) {
      lines.push('امتحانات مفتوحة قدامه دلوقتي ولسه ماذاكرهاش:');
      for (const exam of pendingExams) {
        lines.push(
          formatCopy('- {exam} (في {course})', {
            exam: exam.lessonTitle,
            course: exam.courseTitle,
          }),
        );
      }
    }

    if (recentScores.length > 0) {
      lines.push('آخر درجاته:');
      for (const score of recentScores.slice(0, SCORE_LIMIT)) {
        /*
         * The title and the percentage. NOT `attemptId` — an id in a prompt is
         * an invitation to quote it back, and it is the one field here that
         * would let a leaked answer be traced to a row.
         */
        lines.push(
          formatCopy('- {quiz}: {percent}%', {
            quiz: score.quizTitle,
            percent: String(Math.round(score.scorePercent)),
          }),
        );
      }
    }

    return lines.join('\n');
  }
}
