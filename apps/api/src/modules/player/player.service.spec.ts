// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { CourseOutlineSchema, LessonPlayerSchema } from '@ayman/contracts/progress';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { PlayerService } from './player.service';

describe('PlayerService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const gate = new LessonGateService(prisma);
  const service = new PlayerService(
    prisma,
    new LessonAccessService(prisma, gate, new EntitlementService(prisma)),
    gate,
    { resolve: (key) => `https://media.test/${key}` },
    // The outline and lesson cases never stream bytes; `resourceStream` has
    // its own suite in `resource-access.spec.ts` with a real stub.
    { getStream: async () => { throw new Error('not used'); }, stat: async () => null } as never,
  );

  let userId = '';
  let strangerId = '';
  let instructorId = '';
  let courseId = '';
  let courseSlug = '';
  let enrollmentId = '';
  const lessons: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();
    courseSlug = `pl-course-${stamp}`;

    userId = (
      await prisma.user.create({
        data: { id: `pl-${stamp}`, name: 'طالب', email: `pl-${stamp}@t.test` },
      })
    ).id;
    strangerId = (
      await prisma.user.create({
        data: { id: `pls-${stamp}`, name: 'غريب', email: `pls-${stamp}@t.test` },
      })
    ).id;
    instructorId = (
      await prisma.user.create({
        data: { id: `pli-${stamp}`, name: 'مُحاضر', email: `pli-${stamp}@t.test` },
      })
    ).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    courseId = (
      await prisma.course.create({
        data: {
          slug: courseSlug,
          title: 'أساسيات البرمجة',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          year: 2,
          subjectId: subject.id,
          instructorId,
        },
      })
    ).id;

    const one = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة الأولى', position: 1, isPublished: true },
    });
    const two = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة الثانية', position: 2, isPublished: true },
    });

    const a = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: one.id,
        title: 'مقدمة',
        kind: 'video',
        position: 1,
        isPublished: true,
        estimatedSeconds: 600,
        video: {
          create: {
            provider: 'youtube',
            externalId: 'dQw4w9WgXcQ',
            durationSeconds: 600,
            posterKey: 'posters/a.webp',
          },
        },
        resources: {
          create: {
            kind: 'presentation',
            title: 'بريزنتيشن المحاضرة',
            description: 'الشرائح اللي اتشرح منها',
            storageKey: 'files/slides.pdf',
            filename: 'slides.pdf',
            mime: 'application/pdf',
            sizeBytes: 1024,
            position: 1,
          },
        },
        // A PUBLISHED bonus quiz on a video lesson — the arrangement
        // `LessonPanel`'s admin comment describes: a short quiz at the end of
        // a recorded lecture, not a `kind: 'quiz'` lesson of its own.
        quiz: { create: { reviewOptions: {}, isPublished: true } },
      },
    });
    const b = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: one.id,
        title: 'ملخص',
        kind: 'text',
        position: 2,
        isPublished: true,
        text: { create: { bodyHtml: '<p>ملخص الوحدة</p>' } },
        // A DRAFT quiz on a non-quiz-kind lesson — `Quiz.lessonId` is 1:1 with
        // any lesson kind (see `LessonPanel`'s admin comment), but a draft
        // must stay invisible to the player exactly like a draft `kind:
        // 'quiz'` lesson would.
        quiz: { create: { reviewOptions: {}, isPublished: false } },
      },
    });
    const c = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: two.id,
        title: 'اختبار',
        kind: 'quiz',
        position: 1,
        isPublished: true,
      },
    });
    // Unpublished — must never appear in the outline or in neighbour links.
    await prisma.lesson.create({
      data: {
        courseId,
        sectionId: two.id,
        title: 'مسودة',
        kind: 'video',
        position: 2,
        isPublished: false,
      },
    });
    lessons.push(a.id, b.id, c.id);

    enrollmentId = (
      await prisma.enrollment.create({
        data: { userId, courseId, source: 'free', status: 'active' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.lessonProgress.deleteMany({ where: { enrollmentId } });
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, strangerId, instructorId] } } });
    await prisma.$disconnect();
  });

  describe('outline', () => {
    it('matches the shared contract exactly', async () => {
      const outline = await service.outline(userId, courseSlug);
      expect(() => CourseOutlineSchema.parse(outline)).not.toThrow();
    });

    it('orders sections and lessons by position and hides unpublished lessons', async () => {
      const outline = await service.outline(userId, courseSlug);

      expect(outline.sections.map((s) => s.title)).toEqual(['الوحدة الأولى', 'الوحدة الثانية']);
      expect(outline.sections[0]?.lessons.map((l) => l.title)).toEqual(['مقدمة', 'ملخص']);
      expect(outline.sections[1]?.lessons.map((l) => l.title)).toEqual(['اختبار']);
      expect(outline.totalLessons).toBe(3);
    });

    it('reports every lesson as not_started before anything is opened', async () => {
      const outline = await service.outline(userId, courseSlug);
      const states = outline.sections.flatMap((s) => s.lessons.map((l) => l.state));
      expect(states.every((state) => state === 'not_started')).toBe(true);
      expect(outline.completedLessons).toBe(0);
    });

    it('404s for a stranger rather than exposing the structure', async () => {
      await expect(service.outline(strangerId, courseSlug)).rejects.toMatchObject({ status: 404 });
    });

    // `CourseDetailsCard`'s «إجمالي الوقت» stat.
    describe('totalEstimatedSeconds', () => {
      afterEach(async () => {
        // Restore the fixture: lesson[1] (text) and lesson[2] (quiz) both
        // start at the Prisma column default, `0`.
        await prisma.lesson.update({ where: { id: lessons[1]! }, data: { estimatedSeconds: 0 } });
        await prisma.lesson.update({ where: { id: lessons[2]! }, data: { estimatedSeconds: 0 } });
        await prisma.lessonVideo.update({
          where: { lessonId: lessons[0]! },
          data: { durationSeconds: 600 },
        });
      });

      it('sums estimatedSeconds across published lessons and excludes quizzes', async () => {
        // lessons[0] (video) already carries 600s from the fixture setup,
        // matching its own estimatedSeconds — this case does not exercise
        // the real-duration-wins rule, see the case below for that.
        await prisma.lesson.update({ where: { id: lessons[1]! }, data: { estimatedSeconds: 300 } });
        // Give the quiz lesson a nonzero estimate too, specifically to prove
        // it is left OUT of the sum — a quiz is the check hanging off a
        // lecture, not a runtime of its own (same rule `isLecture` applies
        // to `CatalogCourse.lessonCount`).
        await prisma.lesson.update({ where: { id: lessons[2]! }, data: { estimatedSeconds: 999 } });

        const outline = await service.outline(userId, courseSlug);
        expect(outline.totalEstimatedSeconds).toBe(900);
        expect(() => CourseOutlineSchema.parse(outline)).not.toThrow();
      });

      // The bug this covers: `estimatedSeconds` is a manually-set field that
      // is, in practice, never populated for real video lessons (every real
      // one sits at the column default, `0`) — so summing it alone made a
      // 1h15m course read as "٠ د". `LessonVideo.durationSeconds` is always
      // real (set by `YouTubeDurationService` at creation) and must win.
      it('prefers a video lesson\'s real duration over its estimatedSeconds', async () => {
        // Deliberately mismatched and non-round, so the sum can only match if
        // the real duration (not the estimate) was used.
        await prisma.lesson.update({ where: { id: lessons[0]! }, data: { estimatedSeconds: 0 } });
        await prisma.lessonVideo.update({
          where: { lessonId: lessons[0]! },
          data: { durationSeconds: 4500 }, // 1h15m, matching the reported bug
        });

        const outline = await service.outline(userId, courseSlug);
        expect(outline.totalEstimatedSeconds).toBe(4500);
      });

      it('falls back to estimatedSeconds for a lesson with no LessonVideo row', async () => {
        // lessons[1] is a text lesson — no `video` row exists for it at all.
        await prisma.lesson.update({ where: { id: lessons[1]! }, data: { estimatedSeconds: 120 } });
        await prisma.lesson.update({ where: { id: lessons[0]! }, data: { estimatedSeconds: 0 } });
        await prisma.lessonVideo.update({
          where: { lessonId: lessons[0]! },
          data: { durationSeconds: 600 },
        });

        const outline = await service.outline(userId, courseSlug);
        expect(outline.totalEstimatedSeconds).toBe(720);
      });
    });

    // `CourseOutlineSidebar`'s own «اطلب الكتاب» link — same pair the
    // catalog and the dashboard read — gates on this.
    describe('book', () => {
      afterEach(async () => {
        await prisma.course.update({
          where: { id: courseId },
          data: { bookTitle: null, bookPriceCents: null },
        });
      });

      it('leaves bookTitle/bookPriceCents null for a course with no book configured', async () => {
        const outline = await service.outline(userId, courseSlug);
        expect(outline.course.bookTitle).toBeNull();
        expect(outline.course.bookPriceCents).toBeNull();
      });

      it('carries the course book pair once one is configured', async () => {
        await prisma.course.update({
          where: { id: courseId },
          data: { bookTitle: 'كتاب البرمجة', bookPriceCents: 25000 },
        });

        const outline = await service.outline(userId, courseSlug);
        expect(outline.course.bookTitle).toBe('كتاب البرمجة');
        expect(outline.course.bookPriceCents).toBe(25000);
        expect(() => CourseOutlineSchema.parse(outline)).not.toThrow();
      });
    });
  });

  describe('lesson', () => {
    it('matches the shared contract exactly', async () => {
      const payload = await service.lesson(userId, lessons[0]!);
      expect(() => LessonPlayerSchema.parse(payload)).not.toThrow();
    });

    it('surfaces a PUBLISHED quiz attached to a non-quiz-kind lesson', async () => {
      const payload = await service.lesson(userId, lessons[0]!);
      expect(payload.lesson.kind).toBe('video');
      expect(payload.quiz).not.toBeNull();
    });

    it('hides a DRAFT quiz attached to a non-quiz-kind lesson', async () => {
      const payload = await service.lesson(userId, lessons[1]!);
      expect(payload.lesson.kind).toBe('text');
      expect(payload.quiz).toBeNull();
    });

    it('returns the bare 11-char YouTube id, never a URL', async () => {
      const payload = await service.lesson(userId, lessons[0]!);
      expect(payload.video?.youtubeId).toBe('dQw4w9WgXcQ');
      expect(payload.video?.youtubeId).not.toContain('http');
      expect(payload.video?.posterUrl).toBe('https://media.test/posters/a.webp');
      expect(payload.autoCompleteAvailable).toBe(true);
    });

    it('serves resources through ownership-checked paths, not a storage URL', async () => {
      const payload = await service.lesson(userId, lessons[0]!);
      const resource = payload.resources[0];

      expect(resource?.kind).toBe('presentation');
      expect(resource?.title).toBe('بريزنتيشن المحاضرة');
      expect(resource?.viewPath).toBe(
        `/api/lessons/${lessons[0]}/resources/${resource?.id}/view`,
      );
      expect(resource?.downloadPath).toBe(
        `/api/lessons/${lessons[0]}/resources/${resource?.id}/download`,
      );
      // A leaked storage key must not be an access grant in itself.
      expect(JSON.stringify(payload)).not.toContain('files/slides.pdf');
    });

    it('carries resources on a lesson that is NOT of kind attachment', async () => {
      // The fixture hangs the presentation off a VIDEO lesson. That is the
      // whole point of the model change: the predecessor required
      // kind === 'attachment', so the lessons that most needed materials
      // could not have them.
      const payload = await service.lesson(userId, lessons[0]!);
      expect(payload.lesson.kind).toBe('video');
      expect(payload.resources).toHaveLength(1);
    });

    it('links neighbours across a section boundary and stops at the ends', async () => {
      const first = await service.lesson(userId, lessons[0]!);
      expect(first.previous).toBeNull();
      expect(first.next?.id).toBe(lessons[1]);

      const middle = await service.lesson(userId, lessons[1]!);
      expect(middle.previous?.id).toBe(lessons[0]);
      // Crosses from الوحدة الأولى into الوحدة الثانية.
      expect(middle.next?.id).toBe(lessons[2]);

      const last = await service.lesson(userId, lessons[2]!);
      expect(last.previous?.id).toBe(lessons[1]);
      // The unpublished draft after it must not become the "next" lesson.
      expect(last.next).toBeNull();
    });

    it('disables auto-completion when the duration is unknown', async () => {
      await prisma.lessonVideo.update({
        where: { lessonId: lessons[0]! },
        data: { durationSeconds: 0 },
      });

      const payload = await service.lesson(userId, lessons[0]!);
      expect(payload.autoCompleteAvailable).toBe(false);

      await prisma.lessonVideo.update({
        where: { lessonId: lessons[0]! },
        data: { durationSeconds: 600 },
      });
    });

    it('never leaks a quiz answer key through the player payload', async () => {
      const payload = await service.lesson(userId, lessons[2]!);
      const raw = JSON.stringify(payload);

      // Contract test, spec §7 P2. It costs nothing now and it is the exact
      // assertion that will matter once the quiz builder lands.
      expect(raw).not.toContain('fraction');
      expect(raw).not.toContain('isCorrect');
      expect(raw).not.toContain('feedback');
      expect(payload.video).toBeNull();
      expect(payload.text).toBeNull();
    });

    it('404s for a stranger', async () => {
      await expect(service.lesson(strangerId, lessons[0]!)).rejects.toMatchObject({ status: 404 });
    });
  });
});
