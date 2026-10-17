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
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { formatCopy } from '@ayman/contracts/format';
import { keepsWrittenOrder, stripOptionLabels } from '@ayman/contracts/quiz/option-label';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import type { QuestionType } from '../../generated/prisma/enums';
import { clamp, gradeQuestion, roundMark, type QuestionResponse } from './grading';

/**
 * What a book page COUNTS — and it must be what a practice can actually SERVE.
 *
 * Essays are out of both. A practice has no grader: the result is computed the
 * moment it is handed in and nobody ever marks it, so an essay in the pool was
 * a text box whose answer was thrown away and scored as unanswered. Counting
 * them would offer «الكل (12)» on a pool of 10.
 */
const PRACTICE_TYPES = { not: 'essay' as const };

const READY_ENTRIES = {
  entries: {
    where: { archivedAt: null, versions: { some: { status: 'ready' as const, type: PRACTICE_TYPES } } },
  },
};

interface StoredPracticeSession {
  sessionId: string;
  userId: string;
  bookId: string;
  bookTitle: string;
  courseSlug: string;
  scope: 'book' | 'unit' | 'lesson';
  /** Absent on sessions stored before it was — see the contract. */
  scopeId?: string;
  scopeTitle: string;
  questionVersionIds: string[];
  /**
   * Option ids per question version, in the order the student is served
   * them. Absent on sessions stored before it was: those keep being served
   * the way they always were, freshly shuffled on every read.
   */
  optionOrder?: Record<string, string[]>;
  createdAt: number;
}

/**
 * The runner's answer as the grader reads it: text for a short answer, the
 * chosen ids for everything else, and `null` for a question left blank — so
 * "skipped" is never graded as "answered with nothing".
 */
function practiceResponse(
  type: QuestionType,
  answer: { optionIds?: string[]; text?: string } | undefined,
): QuestionResponse | null {
  if (!answer) return null;
  if (type === 'short_answer' || type === 'essay') {
    const text = answer.text?.trim() ?? '';
    return text === '' ? null : { kind: 'text', text };
  }
  const optionIds = answer.optionIds ?? [];
  return optionIds.length === 0 ? null : { kind: 'choice', optionIds };
}

/** The two settings the runner shows, and nothing else of the version's. */
function practiceSettings(raw: unknown): { minWords?: number; maxWords?: number } {
  const settings = (raw ?? {}) as { minWords?: unknown; maxWords?: unknown };
  return {
    ...(typeof settings.minWords === 'number' ? { minWords: settings.minWords } : {}),
    ...(typeof settings.maxWords === 'number' ? { maxWords: settings.maxWords } : {}),
  };
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

interface WrittenOption {
  id: string;
  bodyHtml: string;
}

/**
 * The order one question's options are served in — decided ONCE, when the
 * session starts, and stored with it.
 *
 * It used to be reshuffled on every read of the session, so a reload (which
 * the runner survives, answers included) moved the option a student had
 * picked to another row under another letter. The rules are an attempt's
 * (`@ayman/contracts/quiz/option-label`): options that point at each other
 * («أ و د معا», «كل ما سبق») or that the teacher lettered by hand keep the
 * order they were written in, and so does true/false; an ordering question
 * is always shuffled, because its written order IS the answer.
 *
 * `written` must be in position order.
 */
function servedOrder(type: QuestionType, written: readonly WrittenOption[]): string[] {
  const keep =
    type !== 'ordering' &&
    (type === 'true_false' || keepsWrittenOrder(written.map((option) => option.bodyHtml)));
  return (keep ? [...written] : shuffle(written)).map((option) => option.id);
}

/**
 * The options as a student reads them: the letters the teacher typed taken
 * off — over the WRITTEN order, the order those letters describe; the runner
 * draws its own — then arranged in `order`. An option the order does not name
 * follows in written order, so a stale order degrades to a different
 * arrangement, never to a missing option.
 */
function servedOptions(
  written: readonly WrittenOption[],
  order: readonly string[] | undefined,
): WrittenOption[] {
  const bodies = stripOptionLabels(written.map((option) => option.bodyHtml));
  const byId = new Map(
    written.map((option, index) => [option.id, { id: option.id, bodyHtml: bodies[index]! }]),
  );
  const served: WrittenOption[] = [];
  for (const id of order ?? []) {
    const option = byId.get(id);
    if (!option) continue;
    served.push(option);
    byId.delete(id);
  }
  return [...served, ...byId.values()];
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
      scopeTitle = formatCopy(quizExperience.practice.bookScopeTitle, { title: book.title });
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

    // Latest version FIRST, type second: an entry whose newest ready version
    // became an essay is an essay now, and must not be served as the MCQ it
    // used to be.
    const uniqueVersions = Array.from(byEntry.values()).filter((v) => v.type !== 'essay');
    if (uniqueVersions.length === 0) {
      throw new BadRequestException('لا توجد أسئلة جاهزة للاختبار في هذا النطاق حالياً');
    }

    // سحب عينة عشوائية
    const shuffledVersions = shuffle(uniqueVersions);
    const count = Math.min(dto.count, shuffledVersions.length);
    const picked = shuffledVersions.slice(0, count);

    const sessionId = randomUUID();
    const optionOrder = Object.fromEntries(
      picked.map((v) => [v.id, servedOrder(v.type, v.options)]),
    );
    const storedSession: StoredPracticeSession = {
      sessionId,
      userId,
      bookId: book.id,
      bookTitle: book.title,
      courseSlug: book.course.slug,
      scope: dto.scope,
      scopeId: dto.scopeId,
      scopeTitle,
      questionVersionIds: picked.map((v) => v.id),
      optionOrder,
      createdAt: Date.now(),
    };

    // حفظ الجلسة لمدة 24 ساعة
    await this.cacheSet(`extbook:session:${sessionId}`, JSON.stringify(storedSession), 86400);

    // بناء الأسئلة للطالب (بدون أي تسريب للإجابات أو علامات التصحيح)
    const questions: ExternalBookPracticeQuestion[] = picked.map((v, index) => ({
      slotPosition: index + 1,
      questionId: v.id,
      type: v.type,
      stemHtml: v.stemHtml,
      maxMark: Number(v.defaultMark),
      options: servedOptions(v.options, optionOrder[v.id]),
      flagged: false,
      settings: practiceSettings(v.settings),
    }));

    return {
      sessionId,
      bookId: book.id,
      bookTitle: book.title,
      courseSlug: book.course.slug,
      scope: dto.scope,
      scopeId: dto.scopeId,
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
        settings: true,
        generalFeedbackHtml: true,
        options: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            bodyHtml: true,
            fraction: true,
            feedbackHtml: true,
            position: true,
            answerPattern: true,
          },
        },
      },
    });

    const versionMap = new Map(fullVersions.map((v) => [v.id, v]));

    let totalScore = 0;
    let totalMaxScore = 0;
    const review: ExternalBookPracticeReviewQuestion[] = [];

    /*
     * Graded by `gradeQuestion` — the engine every real attempt goes through —
     * not by a second, hand-written copy of it. The copy that stood here
     * compared option IDS for every type, so a short answer (which is text)
     * could never be right, an ordering question was "right" if any item
     * carried weight, and a multi-answer question used its own partial-credit
     * arithmetic instead of the option weights the instructor set.
     */
    session.questionVersionIds.forEach((vid, index) => {
      const version = versionMap.get(vid);
      if (!version) return;

      const slotPosition = index + 1;
      const maxMark = Number(version.defaultMark);
      totalMaxScore += maxMark;

      const studentAns = dto.answers.find((a) => a.questionId === vid);
      const response = practiceResponse(version.type, studentAns);

      const options = version.options.map((o, position) => ({
        id: o.id,
        bodyHtml: o.bodyHtml,
        fraction: Number(o.fraction),
        position: o.position ?? position,
        answerPattern: o.answerPattern ?? null,
        feedbackHtml: o.feedbackHtml ?? null,
      }));
      const settings = (version.settings ?? {}) as { caseSensitive?: boolean };
      const graded = gradeQuestion(
        { type: version.type, caseSensitive: settings.caseSensitive === true, options },
        response,
      );

      // A practice has no per-slot floor or ceiling snapshot, so the mark is
      // simply the fraction of the question's worth, never below zero.
      const fraction = graded.fraction === null ? 0 : clamp(graded.fraction, 0, 1);
      const mark = roundMark(fraction * maxMark);
      totalScore += mark;

      const correctness: ExternalBookPracticeReviewQuestion['correctness'] =
        response === null
          ? 'unanswered'
          : graded.state === 'graded_right'
            ? 'correct'
            : graded.state === 'graded_partial'
              ? 'partial'
              : 'incorrect';

      // The note on THIS answer — what the matched options say — and nothing
      // else. It used to fall back to the general explanation, which the
      // review then printed twice, once under each heading.
      const feedbackHtml =
        graded.matchedOptionIds
          .map((id) => options.find((o) => o.id === id)?.feedbackHtml)
          .filter((value): value is string => Boolean(value))
          .join('') || undefined;

      const rightOptionIds =
        version.type === 'ordering'
          ? [...options].sort((a, b) => a.position - b.position).map((o) => o.id)
          : options.filter((o) => o.fraction > 0).map((o) => o.id);

      review.push({
        slotPosition,
        attemptQuestionId: vid,
        type: version.type,
        stemHtml: version.stemHtml,
        // A short answer's options are its accepted PATTERNS, not choices —
        // listing them would print the answer key as a row of blank options.
        // The rest are listed as they were served, so the review's letters
        // are the ones the student answered under.
        options:
          version.type === 'short_answer'
            ? []
            : servedOptions(version.options, session.optionOrder?.[vid]),
        response: response ?? undefined,
        correctness,
        mark,
        maxMark,
        feedbackHtml,
        generalFeedbackHtml: version.generalFeedbackHtml ?? undefined,
        // Plain text, and only where the review prints it as text: the first
        // full-credit pattern of a short answer. Choice types are marked on
        // their own rows by id.
        rightAnswerText:
          version.type === 'short_answer'
            ? (options.find((o) => o.fraction >= 1 && o.answerPattern)?.answerPattern ?? undefined)
            : undefined,
        rightAnswerOptionIds: version.type === 'short_answer' ? undefined : rightOptionIds,
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
      ...(session.scopeId ? { scopeId: session.scopeId } : {}),
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
          options: v
            ? servedOptions(v.options, session.optionOrder?.[vid] ?? servedOrder(v.type, v.options))
            : [],
          flagged: false,
          settings: practiceSettings(v?.settings),
        };
      },
    );

    return {
      sessionId,
      bookId: session.bookId,
      bookTitle: session.bookTitle,
      courseSlug: session.courseSlug,
      scope: session.scope,
      ...(session.scopeId ? { scopeId: session.scopeId } : {}),
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

