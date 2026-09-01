import { AssistantStudentService } from './assistant-student.service';
import type { Dashboard } from '@ayman/contracts';

/**
 * The boundary «حاجته هو بس، مش حاجات الطلبة التانيين».
 *
 * ⚠️ What is asserted here is a SHAPE, not a behaviour — and that distinction
 * is the whole security argument. There is no test below that checks المساعد
 * "declines" to discuss another student, because المساعد is never given the
 * chance to decline: the only student's data in the process is the caller's
 * own, selected by a query keyed on their session. These tests assert that the
 * selection is keyed that way and that nothing else leaks into the text.
 *
 * A test of "does the model refuse" would be testing a prompt. This is testing
 * that there is nothing to refuse WITH.
 */

const dashboard = (over: Partial<Dashboard> = {}): Dashboard => ({
  continueWatching: null,
  enrolledCourses: [],
  recentScores: [],
  totalWatchedSeconds: 0,
  pendingExams: [],
  ...over,
});

function make(over: { dash?: Dashboard; attempts?: number } = {}) {
  const forUser = jest.fn(async () => over.dash ?? dashboard());
  const count = jest.fn(async () => over.attempts ?? 0);
  const prisma = { quizAttempt: { count } };
  const service = new AssistantStudentService(
    prisma as never,
    { forUser } as never,
  );
  return { service, forUser, count };
}

describe('isSittingExam — the gate the model is never consulted about', () => {
  it('is false with no open attempt', async () => {
    const { service } = make({ attempts: 0 });
    await expect(service.isSittingExam('u1')).resolves.toBe(false);
  });

  it('is true while a paper is open', async () => {
    const { service } = make({ attempts: 1 });
    await expect(service.isSittingExam('u1')).resolves.toBe(true);
  });

  /*
   * `overdue` counts. It is a sitting whose deadline has passed and which the
   * sweeper has not closed yet — still an open paper, and if anything the more
   * attractive moment to go looking for an answer.
   */
  it('counts only this user, and counts overdue as sitting', async () => {
    const { service, count } = make();
    await service.isSittingExam('u1');
    expect(count).toHaveBeenCalledWith({
      where: { userId: 'u1', state: { in: ['in_progress', 'overdue'] } },
    });
  });
});

describe('contextFor — one student, keyed on their own id', () => {
  it('reads through the session-scoped dashboard and nothing else', async () => {
    const { service, forUser } = make();
    await service.contextFor('u1');
    expect(forUser).toHaveBeenCalledWith('u1');
    expect(forUser).toHaveBeenCalledTimes(1);
  });

  it('is null when there is nothing to say', async () => {
    const { service } = make();
    // An empty «بيانات الطالب» heading invites a model to fill the silence.
    await expect(service.contextFor('u1')).resolves.toBeNull();
  });

  it('names courses, progress, the resume point and the marks', async () => {
    const { service } = make({
      dash: dashboard({
        enrolledCourses: [
          {
            id: 'c1',
            slug: 'algo',
            title: 'الخوارزميات',
            coverKey: null,
            subjectNameAr: 'برمجة',
            published: true,
            progressPercent: 62.4,
            completedLessons: 13,
            totalLessons: 21,
            lastLessonId: 'l9',
          },
        ],
        continueWatching: {
          courseId: 'c1',
          courseSlug: 'algo',
          courseTitle: 'الخوارزميات',
          lessonId: 'l9',
          lessonTitle: 'الحلقات',
          lessonKind: 'video',
          progressPercent: 40,
          remainingSeconds: 300,
        },
        recentScores: [
          {
            attemptId: 'a1',
            quizTitle: 'كويز الوحدة الأولى',
            courseSlug: 'algo',
            scorePercent: 70,
            submittedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      }),
    });

    const text = await service.contextFor('u1');
    expect(text).toContain('الخوارزميات');
    expect(text).toContain('13');
    expect(text).toContain('21');
    expect(text).toContain('62');
    expect(text).toContain('الحلقات');
    expect(text).toContain('كويز الوحدة الأولى');
    expect(text).toContain('70');
  });

  /**
   * ⚠️ The block travels to a third-party model. Everything in it is
   * deliberate, and these are the things that must never join it.
   *
   * `attemptId` is the sharpest of them: an id in a prompt is an invitation to
   * quote it back, and it is the one field here that would tie a leaked line
   * to a database row.
   */
  it('carries no ids, and no way to reach a paper or a person', async () => {
    const { service } = make({
      dash: dashboard({
        enrolledCourses: [
          {
            id: 'course-uuid-1',
            slug: 'algo',
            title: 'الخوارزميات',
            coverKey: 'media/x',
            subjectNameAr: 'برمجة',
            published: true,
            progressPercent: 10,
            completedLessons: 1,
            totalLessons: 10,
            lastLessonId: 'lesson-uuid-9',
          },
        ],
        recentScores: [
          {
            attemptId: 'attempt-uuid-1',
            quizTitle: 'كويز',
            courseSlug: 'algo',
            scorePercent: 70,
            submittedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      }),
    });

    const text = (await service.contextFor('u1')) ?? '';
    expect(text).not.toContain('course-uuid-1');
    expect(text).not.toContain('lesson-uuid-9');
    expect(text).not.toContain('attempt-uuid-1');
    expect(text).not.toContain('media/x');
    // And no route a student could be told to open on somebody else's behalf.
    expect(text).not.toContain('/api/');
  });

  it('says a course is closed rather than silently dropping it', async () => {
    const { service } = make({
      dash: dashboard({
        enrolledCourses: [
          {
            id: 'c1',
            slug: 'algo',
            title: 'الخوارزميات',
            coverKey: null,
            subjectNameAr: 'برمجة',
            published: false,
            progressPercent: 5,
            completedLessons: 1,
            totalLessons: 20,
            lastLessonId: null,
          },
        ],
      }),
    });
    expect(await service.contextFor('u1')).toContain('مقفول');
  });
});
