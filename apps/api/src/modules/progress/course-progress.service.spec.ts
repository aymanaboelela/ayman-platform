import { CourseProgressService } from './course-progress.service';

/**
 * The denominator, and only the denominator — plus, below, the EDGE.
 *
 * `recalculate` had no direct spec, and the defect it shipped with was
 * invisible to every test that did cover it indirectly: those all built
 * courses whose sections were published, so the missing
 * `section: { isPublished: true }` never changed an answer. The tests below
 * assert the SHAPE of the two counts rather than a percentage, because the
 * shape is the thing that was wrong.
 */
function makeTx(enrollment: { userId?: string; completedAt?: Date | null } = {}) {
  const tx = {
    lesson: { count: jest.fn(async () => 0) },
    lessonProgress: { count: jest.fn(async () => 0) },
    enrollment: {
      // Read BEFORE the update, for `completedAt` (have we already said it?)
      // and `userId` (who is the student?) — see the service's own note.
      findUniqueOrThrow: jest.fn(async () => ({
        userId: enrollment.userId ?? 'u1',
        completedAt: enrollment.completedAt ?? null,
      })),
      update: jest.fn(async () => ({})),
    },
    notification: { create: jest.fn(async () => ({})) },
  };
  return tx;
}

/** A real `NotificationsService` would need Prisma; what matters here is only
 *  WHETHER `emit` was called and with what, so it is a spy. */
function makeNotifications() {
  return { emit: jest.fn(async () => undefined) };
}

function makeService(notifications = makeNotifications()) {
  return new CourseProgressService(notifications as never);
}

describe('CourseProgressService.recalculate', () => {
  it('counts only lessons the student can actually reach', async () => {
    // A published lesson in an UNPUBLISHED section is not rendered anywhere in
    // the product, so counting it makes 100% unreachable. This predicate must
    // match `player.service.ts`, which is what the outline is built from.
    const tx = makeTx();
    await makeService().recalculate(tx as never, 'e1', 'c1');

    expect(tx.lesson.count).toHaveBeenCalledWith({
      where: {
        courseId: 'c1',
        isPublished: true,
        section: { isPublished: true },
        kind: { not: 'quiz' },
      },
    });
  });

  it('applies the identical predicate to the numerator', async () => {
    // A numerator broader than the denominator would let progress exceed 100%;
    // narrower, and it can never reach it. They have to be the same object.
    const tx = makeTx();
    await makeService().recalculate(tx as never, 'e1', 'c1');

    expect(tx.lessonProgress.count).toHaveBeenCalledWith({
      where: {
        enrollmentId: 'e1',
        state: { in: ['completed', 'passed'] },
        lesson: {
          courseId: 'c1',
          isPublished: true,
          section: { isPublished: true },
          kind: { not: 'quiz' },
        },
      },
    });
  });

  it('stamps completedAt once every reachable lesson is done', async () => {
    const tx = makeTx();
    tx.lesson.count.mockResolvedValueOnce(6);
    tx.lessonProgress.count.mockResolvedValueOnce(6);

    const { percent } = await makeService().recalculate(tx as never, 'e1', 'c1');

    expect(percent).toBe(100);
    expect(tx.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ progressPercent: 100, completedAt: expect.any(Date) }),
      }),
    );
  });

  it('clears completedAt when a new lesson is published into a finished course', async () => {
    const tx = makeTx();
    tx.lesson.count.mockResolvedValueOnce(7);
    tx.lessonProgress.count.mockResolvedValueOnce(6);

    await makeService().recalculate(tx as never, 'e1', 'c1');

    expect(tx.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completedAt: null }) }),
    );
  });

  it('reports 0 rather than dividing by zero on an empty course', async () => {
    const tx = makeTx();
    const { percent } = await makeService().recalculate(tx as never, 'e1', 'c1');

    expect(percent).toBe(0);
    // And must NOT claim the course is finished — `0 === 0` is true and would
    // stamp `completedAt` on a course with nothing in it.
    expect(tx.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completedAt: null }) }),
    );
  });

  it('rounds to two decimals rather than truncating to an integer', async () => {
    const tx = makeTx();
    tx.lesson.count.mockResolvedValueOnce(3);
    tx.lessonProgress.count.mockResolvedValueOnce(1);

    expect((await makeService().recalculate(tx as never, 'e1', 'c1')).percent).toBe(33.33);
  });
});

/**
 * «مبروك، خلصت الكورس» — and the two things that make it either a warm
 * message or an infuriating one.
 *
 * `finished` is not an event. It is recomputed from scratch on every lesson
 * completion and keeps answering `true` for a course that is already done, so
 * every assertion below is about the EDGE: the one recalculation that moved
 * the enrolment's `completedAt` from null to a date. Emitting on the value
 * instead would congratulate a student every single time they re-opened a
 * lesson in a course they closed months ago.
 *
 * The date itself is the other half. `completedAt: finished ? new Date() :
 * null` re-stamped a fresh timestamp on every one of those recalculations, so
 * «خلصته في مارس» quietly drifted forward to «خلصته امبارح» with each revision
 * visit — a fact about the past being rewritten by a read.
 */
describe('CourseProgressService.recalculate — the course_completed edge', () => {
  function finishedTx(enrollment: { userId?: string; completedAt?: Date | null } = {}) {
    const tx = makeTx(enrollment);
    tx.lesson.count.mockResolvedValueOnce(4);
    tx.lessonProgress.count.mockResolvedValueOnce(4);
    return tx;
  }

  it('emits course_completed exactly once, on the transition into finished', async () => {
    const notifications = makeNotifications();
    const tx = finishedTx({ userId: 'student-1', completedAt: null });

    const result = await makeService(notifications).recalculate(tx as never, 'e1', 'c1');

    expect(notifications.emit).toHaveBeenCalledTimes(1);
    expect(notifications.emit).toHaveBeenCalledWith(tx, {
      userId: 'student-1',
      kind: 'course_completed',
      courseId: 'c1',
    });
    // Handed back so the transaction's OWNER can announce once it has
    // committed — the row is written in here, the live push is not.
    expect(result.completedNow).toBe('student-1');
  });

  it('emits INSIDE the caller transaction, never on a client of its own', async () => {
    // A congratulation that survived a rollback tells a student they closed a
    // course the database still thinks they are halfway through.
    const notifications = makeNotifications();
    const tx = finishedTx();

    await makeService(notifications).recalculate(tx as never, 'e1', 'c1');

    expect(notifications.emit.mock.calls[0]![0]).toBe(tx);
  });

  it('emits nothing on a second recalculation of an already-finished course', async () => {
    // The case this whole gate exists for: a student re-opens a lesson in a
    // course they finished in March. Everything recomputes, `finished` is
    // true again, and they must hear nothing.
    const notifications = makeNotifications();
    const tx = finishedTx({ completedAt: new Date('2026-03-01T09:00:00Z') });

    const result = await makeService(notifications).recalculate(tx as never, 'e1', 'c1');

    expect(notifications.emit).not.toHaveBeenCalled();
    expect(result.completedNow).toBeNull();
  });

  it('keeps the original completedAt rather than re-stamping it', async () => {
    const finishedOn = new Date('2026-03-01T09:00:00Z');
    const tx = finishedTx({ completedAt: finishedOn });

    await makeService().recalculate(tx as never, 'e1', 'c1');

    expect(tx.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completedAt: finishedOn }) }),
    );
  });

  it('still stamps a date the first time, and announces nobody when unfinished', async () => {
    // The two ends of the same branch, so neither can be broken silently by a
    // change to the other: an edge stamps, an incomplete course clears.
    const notifications = makeNotifications();

    const first = makeTx({ completedAt: null });
    first.lesson.count.mockResolvedValueOnce(2);
    first.lessonProgress.count.mockResolvedValueOnce(2);
    await makeService().recalculate(first as never, 'e1', 'c1');
    expect(first.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completedAt: expect.any(Date) }) }),
    );

    const partial = makeTx({ completedAt: new Date('2026-03-01T09:00:00Z') });
    partial.lesson.count.mockResolvedValueOnce(3);
    partial.lessonProgress.count.mockResolvedValueOnce(2);
    const result = await makeService(notifications).recalculate(partial as never, 'e1', 'c1');

    // A lesson published into a finished course un-finishes it — unchanged
    // behaviour, and it is also what RE-ARMS the notification: closing that
    // new lesson is a second, real completion and gets its own «مبروك».
    expect(partial.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completedAt: null }) }),
    );
    expect(notifications.emit).not.toHaveBeenCalled();
    expect(result.completedNow).toBeNull();
  });
});
