// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { DEFAULT_REVIEW_OPTIONS } from '@ayman/contracts/quiz/quiz-settings';
import { CohortRankSchema } from '@ayman/contracts/rank';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { CohortRankService, shortName, standing } from './cohort-rank.service';

/**
 * الدفعة هنا سنة مالهاش وجود (٧٠٠ وشوية) عشان الداتابيز المحلية مليانة طلبة
 * سنة تانية، والترتيب بيتحسب على «كل اللي في سنتك». سنة عشوائية يعني الدفعة
 * هي الطلبة اللي التست عملهم وبس.
 */
describe('CohortRankService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new CohortRankService(prisma);

  const year = 700 + Math.floor(Math.random() * 200);
  const ids = {
    top: randomUUID(),
    homework: randomUUID(),
    idle: randomUUID(),
    pending: randomUUID(),
    unenrolled: randomUUID(),
    admin: randomUUID(),
    noYear: randomUUID(),
  };
  let courseId = '';
  const quizIds: string[] = [];

  async function student(id: string, fullName: string, opts: { role?: string; year?: number | null } = {}) {
    await prisma.user.create({
      data: { id, name: fullName, email: `${id}@rank.test`, role: opts.role ?? 'student' },
    });
    await prisma.studentProfile.create({
      data: {
        userId: id,
        fullName,
        gender: 'female',
        phone: `010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
        governorateCode: (await prisma.governorate.findFirstOrThrow()).code,
        year: opts.year === undefined ? year : opts.year,
      },
    });
  }

  async function attempt(userId: string, quizId: string, scaled: number, state: 'submitted' | 'pending_review' = 'submitted') {
    await prisma.quizAttempt.create({
      data: {
        quizId,
        userId,
        attemptNo: 1,
        state,
        submittedAt: new Date(),
        scaledScore: scaled,
        rawScore: scaled,
        sumMarks: 100,
        gradeOutOf: 100,
        passPercent: 50,
        passed: scaled >= 50,
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();

    await student(ids.top, 'ملك سعيد ذكي محمد');
    await student(ids.homework, 'علا سامي سعيد');
    await student(ids.idle, 'طالب ساكت');
    await student(ids.pending, 'نور خالد');
    await student(ids.unenrolled, 'حساب جديد');
    await student(ids.admin, 'أدمن بيجرّب', { role: 'admin' });
    await student(ids.noYear, 'من غير سنة', { year: null });

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const course = await prisma.course.create({
      data: {
        slug: `rank-${randomUUID()}`,
        title: 'كورس الترتيب',
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        subjectId: subject.id,
        year: 2,
        instructorId: ids.admin,
      },
    });
    courseId = course.id;

    const unit = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة', position: 0, isPublished: true },
    });
    const shelf = await prisma.courseSection.create({
      data: { courseId, title: EXAM_SHELF_TITLE, position: 1, isPublished: true },
    });

    const lessons = await Promise.all([
      prisma.lesson.create({ data: { courseId, sectionId: unit.id, title: 'كويز', kind: 'quiz', position: 0, isPublished: true } }),
      prisma.lesson.create({ data: { courseId, sectionId: shelf.id, title: 'امتحان نص الشهر', kind: 'quiz', position: 0, isPublished: true } }),
      prisma.lesson.create({ data: { courseId, sectionId: unit.id, title: 'محاضرة بواجب', kind: 'video', position: 1, isPublished: true } }),
      prisma.lesson.create({ data: { courseId, sectionId: unit.id, title: 'محاضرة تانية بواجب', kind: 'video', position: 2, isPublished: true } }),
    ]);
    for (const lesson of lessons.slice(0, 2)) {
      const quiz = await prisma.quiz.create({
        data: { lessonId: lesson.id, reviewOptions: DEFAULT_REVIEW_OPTIONS, gradeOutOf: 100, isPublished: true },
      });
      quizIds.push(quiz.id);
    }
    const [quizId, examId] = quizIds as [string, string];
    const [, , lecture, lecture2] = lessons;
    for (const lesson of [lecture!, lecture2!]) {
      await prisma.lessonHomework.create({ data: { lessonId: lesson.id, body: '١- سؤال', isPublished: true } });
    }

    for (const id of [ids.top, ids.homework, ids.idle, ids.pending, ids.admin, ids.noYear]) {
      await prisma.enrollment.create({ data: { userId: id, courseId } });
    }

    // ملك: كويز ١٠٠٪ (١٠٠ + ٢٠ بونص) وامتحان ٥٠٪ (×٢ = ١٠٠) → ٢٢٠
    await attempt(ids.top, quizId, 100);
    await attempt(ids.top, examId, 50);
    // علا: كويز ٨٠٪ (٨٠) وواجب اتقبل من غير درجة (٤٠ + ٦٠) → ١٨٠،
    // وفتحت محاضرة تانية بواجب ماسلّمتوش → سلّمت ١ من ٢.
    await attempt(ids.homework, quizId, 80);
    await prisma.homeworkSubmission.create({
      data: { lessonId: lecture!.id, userId: ids.homework, courseId, status: 'accepted', imageCount: 1 },
    });
    const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { userId: ids.homework, courseId } });
    await prisma.lessonProgress.create({
      data: { enrollmentId: enrollment.id, lessonId: lecture2!.id, firstOpenedAt: new Date() },
    });
    // نور: امتحان لسه بيتصحح، ٤٠٪ مؤقتة → ٨٠ نقطة، ومش داخلة في المتوسط.
    await attempt(ids.pending, examId, 40, 'pending_review');
    // الأدمن: أعلى من الكل، بس مش جوّه الدفعة.
    await attempt(ids.admin, quizId, 100);
    await attempt(ids.admin, examId, 100);
  });

  afterAll(async () => {
    // الـruntime role مالوش DELETE على المحاولات — نفس طريقة `quiz-fixtures.ts`.
    const owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DIRECT_DATABASE_URL }),
    });
    await owner.$connect();
    try {
      await owner.quizAttempt.deleteMany({ where: { quizId: { in: quizIds } } });
      await owner.homeworkSubmission.deleteMany({ where: { courseId } });
      await owner.course.delete({ where: { id: courseId } });
      await owner.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    } finally {
      await owner.$disconnect();
    }
    await prisma.$disconnect();
  });

  beforeEach(() => service.clearCache());

  it('ranks the cohort by points, and only students who are enrolled', async () => {
    const top = await service.forUser(ids.top);

    expect(() => CohortRankSchema.parse(top)).not.toThrow();
    expect(top.me.points).toBe(220);
    expect(top.me.rank).toBe(1);
    // عدد الدفعة مابيتبعتش خالص — مش بس مش معروض.
    expect(top.cohort).toEqual({ label: expect.any(String) });
    expect(JSON.stringify(top)).not.toContain('"size"');
    expect(top.pointsToNextRank).toBeNull();
    expect(top.me.betterThanPercent).toBe(100);
  });

  it('counts homework: submitting earns points, and an opened lecture owes its homework', async () => {
    const hw = await service.forUser(ids.homework);

    expect(hw.me.points).toBe(180);
    expect(hw.me.rank).toBe(2);
    expect(hw.me.homework).toEqual({ submitted: 1, accepted: 1, owed: 2 });
    // ٢٢٠ − ١٨٠ + ١ — عشان «تعدّي» مش «تتعادل».
    expect(hw.pointsToNextRank).toBe(41);
  });

  it('scores an unmarked paper provisionally but keeps it out of the average', async () => {
    const pending = await service.forUser(ids.pending);

    expect(pending.me.points).toBe(80);
    expect(pending.me.pendingReview).toBe(1);
    expect(pending.me.exams.count).toBe(1);
    expect(pending.me.exams.average).toBeNull();
    expect(pending.me.average).toBeNull();
  });

  it('splits monthly exams from quizzes and weights the average', async () => {
    const top = await service.forUser(ids.top);

    expect(top.me.quizzes).toEqual({ count: 1, average: 100, fullMarks: 1 });
    expect(top.me.exams).toEqual({ count: 1, average: 50, fullMarks: 0 });
    // مفيش واجب عليها، فالقرص = كويزات ٠٫٤ وامتحانات ٠٫٤ متوزّعين من جديد.
    expect(top.me.average).toBe(75);
  });

  it('ties share a rank, and the idle student is last with nothing to show on the podium', async () => {
    const idle = await service.forUser(ids.idle);

    expect(idle.me.points).toBe(0);
    expect(idle.me.rank).toBe(4);
    expect(idle.podium.map((row) => row.points)).toEqual([220, 180, 80]);
    expect(idle.podium.every((row) => !row.isMe)).toBe(true);
    // اسمين بس — الاسم الكامل لطالب تاني مابيطلعش.
    expect(idle.podium[0]?.name).toBe('ملك سعيد');
    expect(idle.ladder.at(-1)).toEqual({ rank: 4, points: 0, isMe: true });
  });

  it('a student with no year has points but no cohort', async () => {
    const none = await service.forUser(ids.noYear);

    expect(() => CohortRankSchema.parse(none)).not.toThrow();
    expect(none.cohort).toBeNull();
    expect(none.me.rank).toBeNull();
    expect(none.podium).toEqual([]);
  });

  it('an admin still sees their own points, ranked against the cohort they are not part of', async () => {
    await prisma.studentProfile.update({ where: { userId: ids.admin }, data: { year } });
    const admin = await service.forUser(ids.admin);

    expect(admin.me.points).toBe(120 + 250);
    expect(admin.me.rank).toBe(1);
  });
});

describe('standing', () => {
  const row = (userId: string, points: number) => ({ userId, name: userId, points });

  it('uses competition ranking — two on the same points share a rank, the next skips', () => {
    const result = standing([row('a', 50), row('b', 30), row('c', 30), row('d', 10)], row('me', 30));

    expect(result.me.rank).toBe(2);
    expect(result.ladder.map((entry) => [entry.rank, entry.isMe])).toEqual([
      [1, false],
      [2, true],
      [2, false],
      [2, false],
      [5, false],
    ]);
    expect(result.pointsToNextRank).toBe(21);
  });

  it('replaces the viewer’s stale cached row with the live one', () => {
    const result = standing([row('a', 50), row('me', 0)], row('me', 90));

    expect(result.me.rank).toBe(1);
    expect(result.ladder).toHaveLength(2);
    expect(result.me.betterThanPercent).toBe(100);
  });

  it('has no «better than» when the cohort is only the viewer', () => {
    expect(standing([], row('me', 0)).me.betterThanPercent).toBeNull();
  });
});

describe('shortName', () => {
  it('keeps the first two words', () => {
    expect(shortName('  ملك   سعيد ذكي محمد ')).toBe('ملك سعيد');
    expect(shortName('Amr')).toBe('Amr');
    // «عبد» مش اسم لوحده.
    expect(shortName('مريم عبد الرحمن علي')).toBe('مريم عبد الرحمن');
    expect(shortName('عبد الله محمد سيد')).toBe('عبد الله محمد');
  });
});
