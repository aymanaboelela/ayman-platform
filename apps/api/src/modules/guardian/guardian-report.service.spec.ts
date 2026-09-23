import { describe, expect, it, jest } from '@jest/globals';
import { GuardianReportService } from './guardian-report.service';

type Attempt = {
  id: string;
  scaledScore: unknown;
  gradeOutOf: unknown;
  submittedAt: Date | null;
  quiz: { passPercent: unknown; lesson: { title: string; course: { title: string } } } | null;
};

function makeService(options: {
  statuses?: { status: string; _count: { _all: number } }[];
  published?: number;
  attempts?: Attempt[];
}) {
  const prisma = {
    homeworkSubmission: { groupBy: jest.fn(async () => options.statuses ?? []) },
    lessonHomework: { count: jest.fn(async () => options.published ?? 0) },
    quizAttempt: { findMany: jest.fn(async () => options.attempts ?? []) },
  };
  return new GuardianReportService(prisma as never);
}

function paper(over: Partial<Attempt> = {}): Attempt {
  return {
    id: 'a-1',
    scaledScore: 80,
    gradeOutOf: 100,
    submittedAt: new Date('2026-09-01T10:00:00Z'),
    quiz: { passPercent: 70, lesson: { title: 'امتحان ١', course: { title: 'الكورس' } } },
    ...over,
  };
}

/**
 * تقرير ولي الأمر.
 *
 * الأرقام دي **الأب بيحاسب ابنه عليها**. رقم غلط هنا مش خانة غلطانة على
 * شاشة — هو نقاش في بيت على معلومة مالهاش أصل، ومحدش في النقاش ده يقدر
 * يراجع الحساب.
 */
describe('GuardianReportService', () => {
  /*
   * ⚠️ النسبة من `scaledScore / gradeOutOf`، مش `scaledScore` لوحدها.
   *
   * الورقة ممكن تبقى من ٥٠. ٤٧ من ٥٠ = ٩٤٪ — **ناجح بامتياز**. وقراية
   * `scaledScore` على إنها نسبة كانت هتقول «٤٧٪» يعني **راسب**، على نفس
   * الورقة بالظبط.
   */
  it('scores out of the paper’s own total, not out of a hundred', async () => {
    const service = makeService({
      attempts: [paper({ scaledScore: 47, gradeOutOf: 50 })],
    });
    const report = await service.forStudent('u1');

    expect(report.papers[0]?.scorePercent).toBe(94);
    expect(report.papers[0]?.passed).toBe(true);
    expect(report.quizzes).toMatchObject({ sat: 1, passed: 1, failed: 0 });
  });

  /* والنجاح من `passPercent` بتاع الورقة، مش رقم ثابت. */
  it('reads the pass mark from the paper itself', async () => {
    const service = makeService({
      attempts: [
        paper({ id: 'a-1', scaledScore: 75, gradeOutOf: 100, quiz: { passPercent: 80, lesson: { title: 'ص', course: { title: 'ك' } } } }),
      ],
    });
    const report = await service.forStudent('u1');
    expect(report.papers[0]?.passed).toBe(false);
  });

  /*
   * ⚠️ `null` مش صفر لما مفيش امتحانات.
   *
   * صفر بيقرا «امتحن وجاب صفر» — وهي جملة تانية خالص قدام أب، وبتبدأ نقاش
   * على حاجة ماحصلتش.
   */
  it('has no average at all before the first paper, rather than a zero', async () => {
    const report = await makeService({}).forStudent('u1');
    expect(report.quizzes.averagePercent).toBeNull();
    expect(report.quizzes.sat).toBe(0);
  });

  /*
   * والواجبات ليها **مقام**: «سلّم ٣» من غير «من كام» رقم مالوش معنى،
   * والأب مش عارف الكورس فيه كام واجب.
   */
  it('counts homework against what was actually published to him', async () => {
    const service = makeService({
      statuses: [
        { status: 'accepted', _count: { _all: 2 } },
        { status: 'needs_work', _count: { _all: 1 } },
      ],
      published: 5,
    });
    const report = await service.forStudent('u1');

    expect(report.homework).toEqual({ submitted: 3, accepted: 2, needsWork: 1, published: 5 });
  });

  /* ورقة من غير درجة (لسه بتتصحّح) بتتشال، مش بتتحسب صفر. */
  it('leaves an unmarked paper out instead of scoring it zero', async () => {
    const service = makeService({ attempts: [paper({ scaledScore: null })] });
    const report = await service.forStudent('u1');
    expect(report.papers).toHaveLength(0);
    expect(report.quizzes.sat).toBe(0);
  });
});
