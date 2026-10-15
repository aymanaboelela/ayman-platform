import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import type {
  ExternalBookPracticeQuestion,
  ExternalBookPracticeResult,
  ExternalBookPracticeReviewQuestion,
  ExternalBookPracticeSession,
  StartExternalBookPractice,
  StudentExternalBookDetail,
  StudentExternalBookSummary,
  StudentExternalBookUnit,
  SubmitExternalBookPractice,
} from '@ayman/contracts/quiz/external-books';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';

const READY_ENTRIES = {
  entries: { where: { archivedAt: null, versions: { some: { status: 'ready' as const } } } },
};

interface StoredPracticeSession {
  sessionId: string;
  userId: string;
  bookId: string;
  bookTitle: string;
  courseSlug: string;
  scope: 'book' | 'unit' | 'lesson';
  scopeTitle: string;
  questionVersionIds: string[];
  createdAt: number;
}

function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = temp;
  }
  return arr;
}

@Injectable()
export class StudentExternalBooksService {
  /** في حالة عدم توفر Redis في بيئة الاختبارات، بنستخدم ذاكرة داخلية كبديل آمن. */
  private readonly fallbackMemory = new Map<string, { value: string; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(REDIS) private readonly redis?: Redis,
  ) {}

  private async cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.set(key, value, 'EX', ttlSeconds);
        return;
      } catch {
        // Fallback to local memory if Redis call fails
      }
    }
    this.fallbackMemory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  private async cacheGet(key: string): Promise<string | null> {
    if (this.redis) {
      try {
        const val = await this.redis.get(key);
        if (val !== null) return val;
      } catch {
        // Fallback to local memory
      }
    }
    const item = this.fallbackMemory.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.fallbackMemory.delete(key);
      return null;
    }
    return item.value;
  }

  /**
   * التحقق من حق الطالب في الوصول لمحتوى وأسئلة الكورس:
   * 1. الأدمن والمدرس دائمًا لهم حق الوصول.
   * 2. اشتراك نشط في الكورس (Enrollment: active أو completed).
   * 3. منحة صالحة للكورس أو المنصة (AccessGrant).
   * 4. الكورس مجاني ومفتوح للجميع.
   */
  async ensureAccess(userId: string, courseId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user && (user.role === 'admin' || user.role === 'superadmin' || user.role === 'teacher')) {
      return;
    }

    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        userId,
        courseId,
        status: { in: ['active', 'completed'] },
      },
    });
    if (enrollment) return;

    const now = new Date();
    const grant = await this.prisma.accessGrant.findFirst({
      where: {
        userId,
        revokedAt: null,
        OR: [{ scope: 'platform' }, { scope: 'course', courseId }],
        AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }],
      },
    });
    if (grant) return;

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        requiresGrant: true,
        monthlyPriceCents: true,
        quarterlyPriceCents: true,
        yearlyPriceCents: true,
      },
    });
    if (
      course &&
      !course.requiresGrant &&
      !course.monthlyPriceCents &&
      !course.quarterlyPriceCents &&
      !course.yearlyPriceCents
    ) {
      return;
    }

    throw new ForbiddenException('هذا القسم متاح فقط للمشتركين في الكورس');
  }

  /**
   * عرض الكتب الخارجية المتاحة لكورس معيّن للطالب.
   */
  async listForCourse(userId: string, courseId: string): Promise<StudentExternalBookSummary[]> {
    await this.ensureAccess(userId, courseId);

    const books = await this.prisma.externalBook.findMany({
      where: { courseId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        coverKey: true,
        courseId: true,
        rootCategory: {
          select: {
            id: true,
            _count: { select: READY_ENTRIES },
            children: {
              select: {
                id: true,
                _count: { select: READY_ENTRIES },
                children: { select: { id: true, _count: { select: READY_ENTRIES } } },
              },
            },
          },
        },
      },
    });

    return books.map((book) => {
      let totalReady = book.rootCategory?._count.entries ?? 0;
      let unitsCount = 0;
      let lessonsCount = 0;

      if (book.rootCategory?.children) {
        unitsCount = book.rootCategory.children.length;
        for (const unit of book.rootCategory.children) {
          totalReady += unit._count.entries;
          if (unit.children) {
            lessonsCount += unit.children.length;
            for (const lesson of unit.children) {
              totalReady += lesson._count.entries;
            }
          }
        }
      }

      return {
        id: book.id,
        title: book.title,
        coverKey: book.coverKey,
        courseId: book.courseId ?? courseId,
        ready: totalReady,
        unitsCount,
        lessonsCount,
      };
    });
  }

  /**
   * تفاصيل الكتاب الخارجي بالوحدات والدروس وعدد الأسئلة الجاهزة لكل منها.
   */
  async detail(userId: string, bookId: string): Promise<StudentExternalBookDetail> {
    const book = await this.prisma.externalBook.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        title: true,
        coverKey: true,
        archivedAt: true,
        courseId: true,
        course: { select: { id: true, title: true, slug: true } },
        rootCategory: {
          select: {
            id: true,
            _count: { select: READY_ENTRIES },
            children: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              select: {
                id: true,
                name: true,
                _count: { select: READY_ENTRIES },
                children: {
                  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                  select: { id: true, name: true, _count: { select: READY_ENTRIES } },
                },
              },
            },
          },
        },
      },
    });

    if (!book || book.archivedAt !== null || !book.courseId || !book.course || !book.rootCategory) {
      throw new NotFoundException('الكتاب غير موجود أو غير متاح حالياً');
    }

    await this.ensureAccess(userId, book.courseId);

    const bookReady = book.rootCategory._count.entries;
    let grandTotal = bookReady;

    const units: StudentExternalBookUnit[] = book.rootCategory.children.map((unit) => {
      const unitDirectReady = unit._count.entries;
      let unitTotalReady = unitDirectReady;

      const lessons = unit.children.map((lesson) => {
        const lessonReady = lesson._count.entries;
        unitTotalReady += lessonReady;
        return {
          id: lesson.id,
          name: lesson.name,
          categoryId: lesson.id,
          ready: lessonReady,
        };
      });

      grandTotal += unitTotalReady;

      return {
        id: unit.id,
        name: unit.name,
        categoryId: unit.id,
        ready: unitDirectReady,
        totalReady: unitTotalReady,
        lessons,
      };
    });

    return {
      id: book.id,
      title: book.title,
      coverKey: book.coverKey,
      courseId: book.course.id,
      courseTitle: book.course.title,
      courseSlug: book.course.slug,
      categoryId: book.rootCategory.id,
      ready: bookReady,
      totalReady: grandTotal,
      units,
    };
  }

  /**
   * بدء جلسة تدريب/اختبار ذاتي على درس أو وحدة أو الكتاب بالكامل.
   */
  async startPractice(
    userId: string,
    bookId: string,
    dto: StartExternalBookPractice,
  ): Promise<ExternalBookPracticeSession> {
    const book = await this.prisma.externalBook.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        title: true,
        archivedAt: true,
        courseId: true,
        course: { select: { slug: true } },
        rootCategory: {
          select: {
            id: true,
            children: {
              select: {
                id: true,
                name: true,
                children: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!book || book.archivedAt !== null || !book.courseId || !book.course || !book.rootCategory) {
      throw new NotFoundException('الكتاب غير موجود أو غير متاح حالياً');
    }

    await this.ensureAccess(userId, book.courseId);

    // تحديد نطاق التصنيفات والاسم المعروض
    const targetCategoryIds: string[] = [];
    let scopeTitle = book.title;

    if (dto.scope === 'book') {
      targetCategoryIds.push(book.rootCategory.id);
      for (const unit of book.rootCategory.children) {
        targetCategoryIds.push(unit.id);
        for (const lesson of unit.children) {
          targetCategoryIds.push(lesson.id);
        }
      }
      scopeTitle = `امتحان شامل: ${book.title}`;
    } else if (dto.scope === 'unit') {
      const unit = book.rootCategory.children.find((u) => u.id === dto.scopeId);
      if (!unit) throw new NotFoundException('الوحدة المطلوبة غير موجودة في هذا الكتاب');
      targetCategoryIds.push(unit.id);
      for (const lesson of unit.children) {
        targetCategoryIds.push(lesson.id);
      }
      scopeTitle = unit.name;
    } else if (dto.scope === 'lesson') {
      let foundName = '';
      for (const unit of book.rootCategory.children) {
        const lesson = unit.children.find((l) => l.id === dto.scopeId);
        if (lesson) {
          foundName = lesson.name;
          break;
        }
      }
      if (!foundName) throw new NotFoundException('الدرس المطلوب غير موجود في هذا الكتاب');
      targetCategoryIds.push(dto.scopeId);
      scopeTitle = foundName;
    }

    // جلب الأسئلة الجاهزة
    const versions = await this.prisma.questionVersion.findMany({
      where: {
        status: 'ready',
        bankEntry: {
          categoryId: { in: targetCategoryIds },
          archivedAt: null,
        },
      },
      select: {
        id: true,
        bankEntryId: true,
        version: true,
        type: true,
        stemHtml: true,
        defaultMark: true,
        settings: true,
        options: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            bodyHtml: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // أخذ أحدث نسخة لكل سؤال
    const byEntry = new Map<string, (typeof versions)[0]>();
    for (const v of versions) {
      const existing = byEntry.get(v.bankEntryId);
      if (!existing || v.version > existing.version) {
        byEntry.set(v.bankEntryId, v);
      }
    }

    const uniqueVersions = Array.from(byEntry.values());
    if (uniqueVersions.length === 0) {
      throw new BadRequestException('لا توجد أسئلة جاهزة للاختبار في هذا النطاق حالياً');
    }

    // سحب عينة عشوائية
    const shuffledVersions = shuffle(uniqueVersions);
    const count = Math.min(dto.count, shuffledVersions.length);
    const picked = shuffledVersions.slice(0, count);

    const sessionId = randomUUID();
    const storedSession: StoredPracticeSession = {
      sessionId,
      userId,
      bookId: book.id,
      bookTitle: book.title,
      courseSlug: book.course.slug,
      scope: dto.scope,
      scopeTitle,
      questionVersionIds: picked.map((v) => v.id),
      createdAt: Date.now(),
    };

    // حفظ الجلسة لمدة 24 ساعة
    await this.cacheSet(`extbook:session:${sessionId}`, JSON.stringify(storedSession), 86400);

    // بناء الأسئلة للطالب (بدون أي تسريب للإجابات أو علامات التصحيح)
    const questions: ExternalBookPracticeQuestion[] = picked.map((v, index) => {
      const options =
        v.type === 'true_false'
          ? v.options.map((o) => ({ id: o.id, bodyHtml: o.bodyHtml }))
          : shuffle(v.options).map((o) => ({ id: o.id, bodyHtml: o.bodyHtml }));

      return {
        slotPosition: index + 1,
        questionId: v.id,
        type: v.type,
        stemHtml: v.stemHtml,
        maxMark: Number(v.defaultMark),
        options,
        flagged: false,
      };
    });

    return {
      sessionId,
      bookId: book.id,
      bookTitle: book.title,
      courseSlug: book.course.slug,
      scope: dto.scope,
      scopeTitle,
      totalQuestions: questions.length,
      questions,
    };
  }

  /**
   * تسليم الإجابات وحساب الدرجة وتقديم المراجعة الشاملة والتفسيرات.
   */
  async submitPractice(
    userId: string,
    sessionId: string,
    dto: SubmitExternalBookPractice,
  ): Promise<ExternalBookPracticeResult> {
    const rawSession = await this.cacheGet(`extbook:session:${sessionId}`);
    if (!rawSession) {
      throw new NotFoundException('جلسة الاختبار غير موجودة أو انتهت صلاحيتها');
    }

    const session: StoredPracticeSession = JSON.parse(rawSession);
    if (session.userId !== userId) {
      throw new ForbiddenException('غير مصرح لك بتسليم هذا الاختبار');
    }

    const fullVersions = await this.prisma.questionVersion.findMany({
      where: { id: { in: session.questionVersionIds } },
      select: {
        id: true,
        type: true,
        stemHtml: true,
        defaultMark: true,
        generalFeedbackHtml: true,
        options: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            bodyHtml: true,
            fraction: true,
            feedbackHtml: true,
          },
        },
      },
    });

    const versionMap = new Map(fullVersions.map((v) => [v.id, v]));

    let totalScore = 0;
    let totalMaxScore = 0;
    const review: ExternalBookPracticeReviewQuestion[] = [];

    session.questionVersionIds.forEach((vid, index) => {
      const version = versionMap.get(vid);
      if (!version) return;

      const slotPosition = index + 1;
      const maxMark = Number(version.defaultMark);
      totalMaxScore += maxMark;

      const studentAns = dto.answers.find((a) => a.questionId === vid);
      const selectedOptionIds = studentAns?.optionIds ?? [];

      const correctOptionIds = version.options
        .filter((o) => Number(o.fraction) > 0)
        .map((o) => o.id);

      const rightAnswerTexts = version.options
        .filter((o) => Number(o.fraction) > 0)
        .map((o) => o.bodyHtml);

      let correctness: ExternalBookPracticeReviewQuestion['correctness'] = 'unanswered';
      let mark = 0;
      let feedbackHtml = version.generalFeedbackHtml ?? undefined;

      if (selectedOptionIds.length === 0) {
        correctness = 'unanswered';
        mark = 0;
      } else if (version.type === 'mcq_single' || version.type === 'true_false') {
        const chosen = version.options.find((o) => o.id === selectedOptionIds[0]);
        if (chosen) {
          if (chosen.feedbackHtml) {
            feedbackHtml = chosen.feedbackHtml;
          }
          if (Number(chosen.fraction) > 0) {
            correctness = 'correct';
            mark = maxMark * Number(chosen.fraction);
          } else {
            correctness = 'incorrect';
            mark = 0;
          }
        }
      } else if (version.type === 'mcq_multi') {
        const chosenCorrect = selectedOptionIds.filter((id) => correctOptionIds.includes(id));
        const chosenWrong = selectedOptionIds.filter((id) => !correctOptionIds.includes(id));
        if (chosenWrong.length === 0 && chosenCorrect.length === correctOptionIds.length) {
          correctness = 'correct';
          mark = maxMark;
        } else if (chosenCorrect.length > 0 && chosenWrong.length === 0) {
          correctness = 'partial';
          mark = Math.round((maxMark * (chosenCorrect.length / correctOptionIds.length)) * 10) / 10;
        } else {
          correctness = 'incorrect';
          mark = 0;
        }
      } else {
        // الأنواع الأخرى (short_answer وغيرها)
        const chosen = version.options.find((o) => selectedOptionIds.includes(o.id));
        if (chosen && Number(chosen.fraction) > 0) {
          correctness = 'correct';
          mark = maxMark;
        } else {
          correctness = 'incorrect';
          mark = 0;
        }
      }

      totalScore += mark;

      review.push({
        slotPosition,
        attemptQuestionId: vid,
        type: version.type,
        stemHtml: version.stemHtml,
        options: version.options.map((o) => ({ id: o.id, bodyHtml: o.bodyHtml })),
        response: selectedOptionIds,
        correctness,
        mark,
        maxMark,
        feedbackHtml,
        generalFeedbackHtml: version.generalFeedbackHtml ?? undefined,
        rightAnswerText: rightAnswerTexts.join('، '),
        rightAnswerOptionIds: correctOptionIds,
      });
    });

    const percentage = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
    const passed = percentage >= 50;

    const result: ExternalBookPracticeResult = {
      sessionId,
      bookId: session.bookId,
      bookTitle: session.bookTitle,
      courseSlug: session.courseSlug,
      scope: session.scope,
      scopeTitle: session.scopeTitle,
      score: totalScore,
      maxScore: totalMaxScore,
      percentage,
      passed,
      review,
    };

    // حفظ النتيجة لمدة 7 أيام
    await this.cacheSet(`extbook:result:${sessionId}`, JSON.stringify(result), 604800);

    return result;
  }

  /**
   * استرجاع جلسة اختبار نشطة للحل.
   */
  async getSession(userId: string, sessionId: string): Promise<ExternalBookPracticeSession> {
    const rawSession = await this.cacheGet(`extbook:session:${sessionId}`);
    if (!rawSession) {
      throw new NotFoundException('جلسة الاختبار غير موجودة أو انتهت صلاحيتها');
    }
    const session: StoredPracticeSession = JSON.parse(rawSession);
    if (session.userId !== userId) {
      throw new ForbiddenException('غير مصرح لك بالوصول لهذا الاختبار');
    }

    const versions = await this.prisma.questionVersion.findMany({
      where: { id: { in: session.questionVersionIds } },
      select: {
        id: true,
        type: true,
        stemHtml: true,
        defaultMark: true,
        settings: true,
        options: {
          orderBy: { position: 'asc' },
          select: { id: true, bodyHtml: true },
        },
      },
    });

    const byId = new Map(versions.map((v) => [v.id, v]));
    const questions: ExternalBookPracticeQuestion[] = session.questionVersionIds.map(
      (vid, index) => {
        const v = byId.get(vid);
        return {
          slotPosition: index + 1,
          questionId: vid,
          type: v?.type ?? 'mcq_single',
          stemHtml: v?.stemHtml ?? '',
          maxMark: Number(v?.defaultMark ?? 1),
          options: v ? (v.type === 'true_false' ? v.options : shuffle(v.options)) : [],
          flagged: false,
        };
      },
    );

    return {
      sessionId,
      bookId: session.bookId,
      bookTitle: session.bookTitle,
      courseSlug: session.courseSlug,
      scope: session.scope,
      scopeTitle: session.scopeTitle,
      totalQuestions: questions.length,
      questions,
    };
  }

  /**
   * استرجاع نتيجة اختبار سابق من المعرف.
   */
  async getPracticeResult(userId: string, sessionId: string): Promise<ExternalBookPracticeResult> {
    const rawResult = await this.cacheGet(`extbook:result:${sessionId}`);
    if (!rawResult) {
      throw new NotFoundException('النتيجة غير موجودة أو انتهت صلاحيتها');
    }
    const result: ExternalBookPracticeResult = JSON.parse(rawResult);
    return result;
  }
}

