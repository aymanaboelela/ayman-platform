import { CourseProgressService } from './course-progress.service';

/**
 * The denominator, and only the denominator.
 *
 * `recalculate` had no direct spec, and the defect it shipped with was
 * invisible to every test that did cover it indirectly: those all built
 * courses whose sections were published, so the missing
 * `section: { isPublished: true }` never changed an answer. The tests below
 * assert the SHAPE of the two counts rather than a percentage, because the
 * shape is the thing that was wrong.
 */
function makeTx() {
  const tx = {
    lesson: { count: jest.fn(async () => 0) },
    lessonProgress: { count: jest.fn(async () => 0) },
    enrollment: {
      update: jest.fn(async () => ({})),
      // Not previously finished, by default — the common case for every test
      // that is not specifically about the already-finished branch.
      findUniqueOrThrow: jest.fn(async () => ({ completedAt: null })),
    },
  };
  return tx;
}

describe('CourseProgressService.recalculate', () => {
  it('counts only lessons the student can actually reach', async () => {
    // A published lesson in an UNPUBLISHED section is not rendered anywhere in
    // the product, so counting it makes 100% unreachable. This predicate must
    // match `player.service.ts`, which is what the outline is built from.
    const tx = makeTx();
    await new CourseProgressService().recalculate(tx as never, 'e1', 'c1');

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
    await new CourseProgressService().recalculate(tx as never, 'e1', 'c1');

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

    const { percent } = await new CourseProgressService().recalculate(tx as never, 'e1', 'c1');

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

    await new CourseProgressService().recalculate(tx as never, 'e1', 'c1');

    expect(tx.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completedAt: null }) }),
    );
  });

  it('reports 0 rather than dividing by zero on an empty course', async () => {
    const tx = makeTx();
    const { percent } = await new CourseProgressService().recalculate(tx as never, 'e1', 'c1');

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

    const { percent } = await new CourseProgressService().recalculate(tx as never, 'e1', 'c1');
    expect(percent).toBe(33.33);
  });

  /**
   * `justFinished` — the TRANSITION, not the state. A caller (currently
   * `LessonProgressService`/`HeartbeatService`, to fire an exam-unlocked
   * notification exactly once) must be able to tell "just now completed"
   * from "was already completed", or it re-notifies on every lecture-
   * completion call a course that has none left to complete ever makes
   * again.
   */
  describe('justFinished', () => {
    it('is true the first time every reachable lesson is done', async () => {
      const tx = makeTx();
      tx.lesson.count.mockResolvedValueOnce(6);
      tx.lessonProgress.count.mockResolvedValueOnce(6);
      // Default `findUniqueOrThrow` already answers `completedAt: null`.

      const { justFinished } = await new CourseProgressService().recalculate(
        tx as never,
        'e1',
        'c1',
      );
      expect(justFinished).toBe(true);
    });

    it('is false on a later call once already finished', async () => {
      const tx = makeTx();
      tx.lesson.count.mockResolvedValueOnce(6);
      tx.lessonProgress.count.mockResolvedValueOnce(6);
      tx.enrollment.findUniqueOrThrow.mockResolvedValueOnce({ completedAt: new Date() });

      const { justFinished } = await new CourseProgressService().recalculate(
        tx as never,
        'e1',
        'c1',
      );
      expect(justFinished).toBe(false);
    });

    it('is false while the course is still not done', async () => {
      const tx = makeTx();
      tx.lesson.count.mockResolvedValueOnce(6);
      tx.lessonProgress.count.mockResolvedValueOnce(5);

      const { justFinished } = await new CourseProgressService().recalculate(
        tx as never,
        'e1',
        'c1',
      );
      expect(justFinished).toBe(false);
    });

    it('is false on an empty course, even though completedAt was never set', async () => {
      const tx = makeTx();

      const { justFinished } = await new CourseProgressService().recalculate(
        tx as never,
        'e1',
        'c1',
      );
      expect(justFinished).toBe(false);
    });
  });
});
