import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../prisma/prisma.service';
import { StudentExternalBooksService } from './student-external-books.service';

describe('StudentExternalBooksService', () => {
  let service: StudentExternalBooksService;
  let prismaMock: {
    user: { findUnique: jest.Mock };
    enrollment: { findFirst: jest.Mock };
    accessGrant: { findFirst: jest.Mock };
    course: { findUnique: jest.Mock };
    externalBook: { findMany: jest.Mock; findUnique: jest.Mock };
    questionVersion: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prismaMock = {
      user: { findUnique: jest.fn() },
      enrollment: { findFirst: jest.fn() },
      accessGrant: { findFirst: jest.fn() },
      course: { findUnique: jest.fn() },
      externalBook: { findMany: jest.fn(), findUnique: jest.fn() },
      questionVersion: { findMany: jest.fn() },
    };
    service = new StudentExternalBooksService(prismaMock as unknown as PrismaService);
  });

  describe('ensureAccess', () => {
    it('allows admin or superadmin regardless of course', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'admin' });
      await expect(service.ensureAccess('admin-id', 'course-id')).resolves.toBeUndefined();
    });

    it('allows enrolled student', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'student' });
      prismaMock.enrollment.findFirst.mockResolvedValue({ id: 'enr-1', status: 'active' });
      await expect(service.ensureAccess('student-id', 'course-id')).resolves.toBeUndefined();
    });

    it('allows student with active access grant', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'student' });
      prismaMock.enrollment.findFirst.mockResolvedValue(null);
      prismaMock.accessGrant.findFirst.mockResolvedValue({ id: 'grant-1' });
      await expect(service.ensureAccess('student-id', 'course-id')).resolves.toBeUndefined();
    });

    it('allows access if course is completely free', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'student' });
      prismaMock.enrollment.findFirst.mockResolvedValue(null);
      prismaMock.accessGrant.findFirst.mockResolvedValue(null);
      prismaMock.course.findUnique.mockResolvedValue({
        requiresGrant: false,
        monthlyPriceCents: null,
        quarterlyPriceCents: null,
        yearlyPriceCents: null,
      });
      await expect(service.ensureAccess('student-id', 'course-id')).resolves.toBeUndefined();
    });

    it('throws ForbiddenException if student is not enrolled and course is paid', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'student' });
      prismaMock.enrollment.findFirst.mockResolvedValue(null);
      prismaMock.accessGrant.findFirst.mockResolvedValue(null);
      prismaMock.course.findUnique.mockResolvedValue({
        requiresGrant: true,
        monthlyPriceCents: 20000,
        quarterlyPriceCents: null,
        yearlyPriceCents: null,
      });
      await expect(service.ensureAccess('student-id', 'course-id')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('listForCourse', () => {
    it('returns books with counted ready questions for course', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'student' });
      prismaMock.enrollment.findFirst.mockResolvedValue({ id: 'enr-1', status: 'active' });

      const bookId = randomUUID();
      const courseId = randomUUID();
      prismaMock.externalBook.findMany.mockResolvedValue([
        {
          id: bookId,
          title: 'كتاب المعاصر',
          coverKey: null,
          courseId,
          rootCategory: {
            id: 'cat-root',
            _count: { entries: 5 },
            children: [
              {
                id: 'cat-u1',
                _count: { entries: 10 },
                children: [{ id: 'cat-l1', _count: { entries: 15 } }],
              },
            ],
          },
        },
      ]);

      const res = await service.listForCourse('student-id', courseId);
      expect(res).toHaveLength(1);
      expect(res[0]?.title).toBe('كتاب المعاصر');
      expect(res[0]?.ready).toBe(30); // 5 + 10 + 15
      expect(res[0]?.unitsCount).toBe(1);
      expect(res[0]?.lessonsCount).toBe(1);
    });
  });

  describe('startPractice & submitPractice', () => {
    const userId = 'student-1';
    const bookId = randomUUID();
    const courseId = randomUUID();
    const unitId = randomUUID();
    const lessonId = randomUUID();
    const q1Id = randomUUID();
    const opt1Id = randomUUID();
    const opt2Id = randomUUID();

    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue({ role: 'student' });
      prismaMock.enrollment.findFirst.mockResolvedValue({ id: 'enr-1', status: 'active' });
      prismaMock.externalBook.findUnique.mockResolvedValue({
        id: bookId,
        title: 'كتاب الامتحان',
        archivedAt: null,
        courseId,
        course: { id: courseId, title: 'فيزياء', slug: 'physics' },
        rootCategory: {
          id: 'root-id',
          _count: { entries: 0 },
          children: [
            {
              id: unitId,
              name: 'الوحدة الأولى',
              _count: { entries: 2 },
              children: [
                {
                  id: lessonId,
                  name: 'الدرس الأول',
                  _count: { entries: 2 },
                  children: [],
                },
              ],
            },
          ],
        },
      });
    });

    it('creates a session with questions stripped of answer keys', async () => {
      prismaMock.questionVersion.findMany.mockResolvedValue([
        {
          id: q1Id,
          bankEntryId: 'b-1',
          version: 1,
          type: 'mcq_single',
          stemHtml: '<p>السؤال الأول؟</p>',
          defaultMark: 2,
          settings: {},
          options: [
            { id: opt1Id, bodyHtml: 'أ' },
            { id: opt2Id, bodyHtml: 'ب' },
          ],
        },
      ]);

      const session = await service.startPractice(userId, bookId, {
        scope: 'unit',
        scopeId: unitId,
        count: 5,
      });

      expect(session.sessionId).toBeDefined();
      expect(session.totalQuestions).toBe(1);
      expect(session.questions[0]?.questionId).toBe(q1Id);
      expect(session.questions[0]?.maxMark).toBe(2);
      expect(session.questions[0]?.options).toHaveLength(2);
      // Ensure fraction or feedback is not leaked
      expect(
        (session.questions[0]?.options[0] as unknown as Record<string, unknown>).fraction,
      ).toBeUndefined();
    });

    it('throws BadRequestException if no ready questions exist', async () => {
      prismaMock.questionVersion.findMany.mockResolvedValue([]);

      await expect(
        service.startPractice(userId, bookId, {
          scope: 'unit',
          scopeId: unitId,
          count: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('grades submitted answers and provides complete feedback review', async () => {
      prismaMock.questionVersion.findMany
        .mockResolvedValueOnce([
          {
            id: q1Id,
            bankEntryId: 'b-1',
            version: 1,
            type: 'mcq_single',
            stemHtml: '<p>سؤال 1</p>',
            defaultMark: 2,
            settings: {},
            options: [
              { id: opt1Id, bodyHtml: 'أ' },
              { id: opt2Id, bodyHtml: 'ب' },
            ],
          },
        ])
        .mockResolvedValueOnce([
          {
            id: q1Id,
            type: 'mcq_single',
            stemHtml: '<p>سؤال 1</p>',
            defaultMark: 2,
            generalFeedbackHtml: '<p>التفسير والشرح</p>',
            options: [
              { id: opt1Id, bodyHtml: 'أ', fraction: 1, feedbackHtml: '<p>صح ممتاز</p>' },
              { id: opt2Id, bodyHtml: 'ب', fraction: 0, feedbackHtml: '<p>خطأ، الإجابة أ</p>' },
            ],
          },
        ]);

      const session = await service.startPractice(userId, bookId, {
        scope: 'book',
        scopeId: bookId,
        count: 5,
      });

      const result = await service.submitPractice(userId, session.sessionId, {
        answers: [
          {
            slotPosition: 1,
            questionId: q1Id,
            optionIds: [opt1Id],
          },
        ],
      });

      expect(result.score).toBe(2);
      expect(result.maxScore).toBe(2);
      expect(result.percentage).toBe(100);
      expect(result.passed).toBe(true);
      expect(result.review).toHaveLength(1);
      expect(result.review[0]?.correctness).toBe('correct');
      expect(result.review[0]?.feedbackHtml).toBe('<p>صح ممتاز</p>');
      expect(result.review[0]?.rightAnswerOptionIds).toEqual([opt1Id]);
      // The review reads `{kind, optionIds}` — a bare array highlighted nothing.
      expect(result.review[0]?.response).toEqual({ kind: 'choice', optionIds: [opt1Id] });
    });

    /** One served question, then the version the grader reads back. */
    function servesOne(
      version: { id: string; type: string; options: Array<Record<string, unknown>> } & Record<string, unknown>,
    ) {
      prismaMock.questionVersion.findMany
        .mockResolvedValueOnce([
          {
            id: version.id,
            bankEntryId: `entry-${version.id}`,
            version: 1,
            type: version.type,
            stemHtml: '<p>سؤال</p>',
            defaultMark: 2,
            settings: {},
            options: version.options.map((o) => ({ id: o.id, bodyHtml: o.bodyHtml })),
          },
        ])
        .mockResolvedValueOnce([{ stemHtml: '<p>سؤال</p>', defaultMark: 2, settings: {}, ...version }]);
    }

    it('grades a short answer by its pattern — it is text, never an option id', async () => {
      const shortId = randomUUID();
      const patternId = randomUUID();
      servesOne({
        id: shortId,
        type: 'short_answer',
        generalFeedbackHtml: null,
        options: [
          { id: patternId, bodyHtml: '', fraction: 1, feedbackHtml: null, position: 0, answerPattern: 'CPU' },
        ],
      });

      const session = await service.startPractice(userId, bookId, { scope: 'book', scopeId: bookId, count: 5 });
      const result = await service.submitPractice(userId, session.sessionId, {
        answers: [{ slotPosition: 1, questionId: shortId, optionIds: [], text: 'cpu' }],
      });

      expect(result.review[0]?.correctness).toBe('correct');
      expect(result.score).toBe(2);
      expect(result.review[0]?.rightAnswerText).toBe('CPU');
      // The accepted patterns are the answer key, not options to list.
      expect(result.review[0]?.options).toEqual([]);
    });

    it('leaves a skipped question unanswered and does not repeat the explanation as a note', async () => {
      servesOne({
        id: q1Id,
        type: 'mcq_single',
        generalFeedbackHtml: '<p>الشرح</p>',
        options: [
          { id: opt1Id, bodyHtml: 'أ', fraction: 1, feedbackHtml: null, position: 0 },
          { id: opt2Id, bodyHtml: 'ب', fraction: 0, feedbackHtml: null, position: 1 },
        ],
      });

      const session = await service.startPractice(userId, bookId, { scope: 'book', scopeId: bookId, count: 5 });
      const result = await service.submitPractice(userId, session.sessionId, { answers: [] });

      expect(result.review[0]?.correctness).toBe('unanswered');
      expect(result.review[0]?.response).toBeUndefined();
      expect(result.review[0]?.feedbackHtml).toBeUndefined();
      expect(result.review[0]?.generalFeedbackHtml).toBe('<p>الشرح</p>');
    });

    it('never serves an essay — a practice has nobody to mark it', async () => {
      prismaMock.questionVersion.findMany.mockResolvedValueOnce([
        {
          id: randomUUID(),
          bankEntryId: 'essay-entry',
          version: 1,
          type: 'essay',
          stemHtml: '<p>اكتب</p>',
          defaultMark: 5,
          settings: {},
          options: [],
        },
      ]);

      await expect(
        service.startPractice(userId, bookId, { scope: 'book', scopeId: bookId, count: 5 }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
