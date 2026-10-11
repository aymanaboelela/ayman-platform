import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ExternalBookCourse,
  ExternalBookDetail,
  ExternalBookRow,
  ExternalBooks,
} from '@ayman/contracts/quiz/external-books';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { loadBookLessonLinks } from './book-lesson-links';

/** أسئلة جاهزة (نسخة منشورة واحدة على الأقل) — نفس تعريف `game-banks.service.ts`. */
const READY_ENTRIES = {
  entries: { where: { archivedAt: null, versions: { some: { status: 'ready' as const } } } },
};

/**
 * «أسئلة كتب خارجية» — كتاب ← وحدة ← درس، شجرة تصنيفات في بنك الأسئلة
 * الموجود. انظر `packages/contracts/src/quiz/external-books.ts` للصورة
 * الكاملة وليه الشجرة دي مش جدول جديد.
 */
@Injectable()
export class ExternalBooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ExternalBooks> {
    const books = await this.prisma.externalBook.findMany({
      orderBy: [{ archivedAt: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        coverKey: true,
        archivedAt: true,
        courseId: true,
        rootCategory: {
          select: {
            id: true,
            _count: { select: READY_ENTRIES },
            children: {
              select: {
                _count: { select: READY_ENTRIES },
                children: { select: { _count: { select: READY_ENTRIES } } },
              },
            },
          },
        },
      },
    });
    return { rows: books.map(toRow), courses: await this.courses() };
  }

  /** الكورسات بصفّها وشعبتها — للاختيار، ولتقسيم الكتب في الشاشة. */
  private async courses(): Promise<ExternalBookCourse[]> {
    const courses = await this.prisma.course.findMany({
      orderBy: [{ year: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, year: true, forGeneral: true, forLanguages: true, system: { select: { nameAr: true } } },
    });
    return courses.map((course) => ({
      id: course.id,
      title: course.title,
      year: course.year,
      systemName: course.system.nameAr,
      stream: course.forGeneral && course.forLanguages ? 'both' : course.forLanguages ? 'languages' : 'general',
    }));
  }

  async create(title: string, courseId?: string | null): Promise<ExternalBookRow> {
    if (courseId) {
      const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
      if (!course) throw new NotFoundException();
    }
    const book = await this.prisma.$transaction(async (tx) => {
      const created = await tx.externalBook.create({ data: { title, courseId: courseId ?? null } });
      await tx.questionCategory.create({
        data: { name: `كتاب — ${title}`, externalBookId: created.id },
      });
      return created;
    });
    await this.audit.record({
      action: 'external-book:create',
      resourceType: AUDIT_RESOURCES.externalBook,
      resourceId: book.id,
      outcome: 'success',
      metadata: { title, courseId: courseId ?? null },
    });
    return this.row(book.id);
  }

  async update(
    bookId: string,
    patch: { title?: string; archived?: boolean; courseId?: string | null },
  ): Promise<ExternalBookRow> {
    const book = await this.prisma.externalBook.findUnique({ where: { id: bookId }, select: { id: true, title: true } });
    if (!book) throw new NotFoundException();
    if (patch.courseId) {
      const course = await this.prisma.course.findUnique({ where: { id: patch.courseId }, select: { id: true } });
      if (!course) throw new NotFoundException();
    }

    const nextTitle = patch.title?.trim();
    await this.prisma.$transaction(async (tx) => {
      await tx.externalBook.update({
        where: { id: bookId },
        data: {
          title: nextTitle,
          archivedAt: patch.archived === undefined ? undefined : patch.archived ? new Date() : null,
          courseId: patch.courseId,
        },
      });
      // اسم تصنيف الجذر بيتبع اسم الكتاب — نفس اللي «أسئلة الألعاب» بتعمله
      // لما كورس يتغيّر اسمه (`modesByCourse` caller) مش بيتابع، لكن هنا الاسم
      // هو العنوان اللي هيفضل يظهر في القايمة الشقة لـ`/admin/questions`.
      if (nextTitle) {
        await tx.questionCategory.updateMany({
          where: { externalBookId: bookId },
          data: { name: `كتاب — ${nextTitle}` },
        });
      }
    });

    await this.audit.record({
      action: 'external-book:update',
      resourceType: AUDIT_RESOURCES.externalBook,
      resourceId: bookId,
      outcome: 'success',
      metadata: patch,
    });
    return this.row(bookId);
  }

  async detail(bookId: string): Promise<ExternalBookDetail> {
    const book = await this.prisma.externalBook.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        title: true,
        coverKey: true,
        archivedAt: true,
        courseId: true,
        rootCategory: {
          select: {
            id: true,
            _count: { select: READY_ENTRIES },
            children: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                name: true,
                sortOrder: true,
                _count: { select: READY_ENTRIES },
                children: {
                  orderBy: { sortOrder: 'asc' },
                  select: { id: true, name: true, sortOrder: true, _count: { select: READY_ENTRIES } },
                },
              },
            },
          },
        },
      },
    });
    if (!book || !book.rootCategory) throw new NotFoundException();

    // نفس الربط اللي التحديات بتشوفه بالظبط — الشاشة بتقول «الدرس ده بيغذّي
    // المحاضرة دي» عشان لو الترتيب اتزق (فيديو زيادة وسط الوحدة) يبان هنا
    // قبل ما طالب يتسأل في درس غير اللي اختاره.
    const [links, courses] = await Promise.all([
      book.courseId && book.archivedAt === null ? loadBookLessonLinks(this.prisma, [book.courseId]) : [],
      this.courses(),
    ]);
    const lessonIds = [...new Set(links.map((link) => link.lessonId))];
    const titles = new Map(
      (await this.prisma.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true } })).map(
        (lesson) => [lesson.id, lesson.title.trim()],
      ),
    );
    const linkedLesson = (categoryId: string) => {
      const link = links.find((candidate) => candidate.categoryId === categoryId);
      return link ? { id: link.lessonId, title: titles.get(link.lessonId) ?? '' } : null;
    };

    return {
      id: book.id,
      title: book.title,
      coverKey: book.coverKey,
      archived: book.archivedAt !== null,
      courseId: book.courseId,
      courses,
      categoryId: book.rootCategory.id,
      ready: book.rootCategory._count.entries,
      units: book.rootCategory.children.map((unit) => ({
        id: unit.id,
        name: unit.name,
        categoryId: unit.id,
        ready: unit._count.entries,
        lessons: unit.children.map((lesson) => ({
          id: lesson.id,
          name: lesson.name,
          categoryId: lesson.id,
          ready: lesson._count.entries,
          linkedLesson: linkedLesson(lesson.id),
        })),
      })),
    };
  }

  /**
   * وحدة جديدة — تصنيف ابن تصنيف جذر الكتاب مباشرة.
   *
   * ⚠️ الاسم بيتخزّن زي ما الأدمن كتبه بالظبط، من غير اسم الكتاب قدّامه — عكس
   * «أسئلة الألعاب» اللي بتحط اسم الكورس في اسم التصنيف. هناك اسم الدرس
   * الحقيقي في جدول `Lesson` مابيتأثّرش، فاسم التصنيف ممكن يبقى قديم بعد
   * rename ومفيش مشكلة. هنا مفيش جدول تاني يرجع له — لو حطّيت اسم الكتاب
   * قدّام كل وحدة/درس، rename للكتاب كان هيسيب كل أسمائهم قديمة من غير حل
   * نضيف. النتيجة: وحدتين من كتابين مختلفين بنفس الاسم بيظهروا بنفس الاسم في
   * القايمة الشقة لـ`/admin/questions` — مقبول، شاشة الكتاب نفسها (مش
   * القايمة الشقة) هي مكان العمل الأساسي.
   */
  async createUnit(bookId: string, name: string): Promise<{ id: string; name: string }> {
    const book = await this.prisma.externalBook.findUnique({
      where: { id: bookId },
      select: { rootCategory: { select: { id: true } } },
    });
    if (!book?.rootCategory) throw new NotFoundException();

    const count = await this.prisma.questionCategory.count({ where: { parentId: book.rootCategory.id } });
    const unit = await this.prisma.questionCategory.create({
      data: { name, parentId: book.rootCategory.id, sortOrder: count },
      select: { id: true, name: true },
    });
    await this.audit.record({
      action: 'external-book:create-unit',
      resourceType: AUDIT_RESOURCES.externalBook,
      resourceId: bookId,
      outcome: 'success',
      metadata: { unitId: unit.id, name },
    });
    return unit;
  }

  /** درس جديد — تصنيف ابن الوحدة. الوحدة لازم تكون فعلًا ابن تصنيف جذر الكتاب ده. */
  async createLesson(bookId: string, unitId: string, name: string): Promise<{ id: string; name: string }> {
    const unit = await this.prisma.questionCategory.findFirst({
      where: { id: unitId, parent: { externalBookId: bookId } },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException();

    const count = await this.prisma.questionCategory.count({ where: { parentId: unitId } });
    const lesson = await this.prisma.questionCategory.create({
      data: { name, parentId: unitId, sortOrder: count },
      select: { id: true, name: true },
    });
    await this.audit.record({
      action: 'external-book:create-lesson',
      resourceType: AUDIT_RESOURCES.externalBook,
      resourceId: bookId,
      outcome: 'success',
      metadata: { unitId, lessonId: lesson.id, name },
    });
    return lesson;
  }

  /**
   * تصنيف موجود في البنك بيبقى درس في الوحدة دي — بأسئلته زي ما هي، من غير
   * لصق تاني. بس تصنيف عادي: مش جوه شجرة تانية، ومش «أسئلة ألعاب»، ومالوش
   * تصنيفات تحته — عشان النقل مايشيلش أسئلة من مكان حد معتمد عليه.
   */
  async adoptLesson(bookId: string, unitId: string, categoryId: string): Promise<{ id: string; name: string }> {
    const unit = await this.prisma.questionCategory.findFirst({
      where: { id: unitId, parent: { externalBookId: bookId } },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException();
    const category = await this.prisma.questionCategory.findUnique({
      where: { id: categoryId },
      select: {
        parentId: true,
        gameCourseId: true,
        gameLessonId: true,
        externalBookId: true,
        _count: { select: { children: true } },
      },
    });
    if (!category) throw new NotFoundException();
    if (
      category.parentId !== null ||
      category.gameCourseId !== null ||
      category.gameLessonId !== null ||
      category.externalBookId !== null ||
      category._count.children > 0
    ) {
      throw new BadRequestException('category is not a plain top-level category');
    }

    const count = await this.prisma.questionCategory.count({ where: { parentId: unitId } });
    const lesson = await this.prisma.questionCategory.update({
      where: { id: categoryId },
      data: { parentId: unitId, sortOrder: count },
      select: { id: true, name: true },
    });
    await this.audit.record({
      action: 'external-book:adopt-lesson',
      resourceType: AUDIT_RESOURCES.externalBook,
      resourceId: bookId,
      outcome: 'success',
      metadata: { unitId, lessonId: lesson.id },
    });
    return lesson;
  }

  /**
   * درس كتاب (تصنيف تحت وحدة) بينتقل لآخر وحدة تانية — في نفس الكتاب أو كتاب
   * تاني — بأسئلته زي ما هي. الدرس اللي اتحذف من المقرر بيطلع كده من كتاب
   * مربوط بكورس لكتاب مش مربوط، فترتيب الربط مايعدّوش.
   */
  async moveLesson(categoryId: string, unitId: string): Promise<{ id: string; name: string }> {
    const lesson = await this.prisma.questionCategory.findFirst({
      where: { id: categoryId, parent: { parent: { externalBookId: { not: null } } } },
      select: { id: true, parent: { select: { parent: { select: { externalBookId: true } } } } },
    });
    const unit = await this.prisma.questionCategory.findFirst({
      where: { id: unitId, parent: { externalBookId: { not: null } } },
      select: { id: true, parent: { select: { externalBookId: true } } },
    });
    if (!lesson || !unit) throw new NotFoundException();

    const count = await this.prisma.questionCategory.count({ where: { parentId: unitId } });
    const moved = await this.prisma.questionCategory.update({
      where: { id: categoryId },
      data: { parentId: unitId, sortOrder: count },
      select: { id: true, name: true },
    });
    await this.audit.record({
      action: 'external-book:move-lesson',
      resourceType: AUDIT_RESOURCES.externalBook,
      resourceId: unit.parent!.externalBookId!,
      outcome: 'success',
      metadata: { lessonId: categoryId, unitId, fromBookId: lesson.parent!.parent!.externalBookId },
    });
    return moved;
  }

  /** إعادة تسمية وحدة أو درس — مش تصنيف جذر كتاب (ده بيتغيّر مع `update`). */
  async renameCategory(categoryId: string, name: string): Promise<{ id: string; name: string }> {
    const category = await this.prisma.questionCategory.findUnique({
      where: { id: categoryId },
      select: { externalBookId: true },
    });
    if (!category || category.externalBookId !== null) throw new NotFoundException();

    return this.prisma.questionCategory.update({ where: { id: categoryId }, data: { name }, select: { id: true, name: true } });
  }

  /**
   * مسح وحدة أو درس فاضي بس — لو فيه أسئلة أو دروس جواه بيترفض (400)، عشان
   * مانمسحش أسئلة اتكتبت من غير ما حد ياخد باله. الدرس/الوحدة المفروض
   * يتفضّوا الأول (ينقل أسئلته أو يتمسحوا من شاشة البنك) قبل ما يتمسح هو.
   */
  async deleteCategory(categoryId: string): Promise<void> {
    const category = await this.prisma.questionCategory.findUnique({
      where: { id: categoryId },
      select: {
        externalBookId: true,
        _count: { select: { entries: true, children: true } },
      },
    });
    if (!category || category.externalBookId !== null) throw new NotFoundException();
    if (category._count.entries > 0 || category._count.children > 0) {
      throw new BadRequestException('category not empty');
    }
    await this.prisma.questionCategory.delete({ where: { id: categoryId } });
  }

  private async row(bookId: string): Promise<ExternalBookRow> {
    const rows = await this.list();
    const row = rows.rows.find((candidate) => candidate.id === bookId);
    if (!row) throw new NotFoundException();
    return row;
  }
}

function toRow(book: {
  id: string;
  title: string;
  coverKey: string | null;
  archivedAt: Date | null;
  courseId: string | null;
  rootCategory: {
    id: string;
    _count: { entries: number };
    children: { _count: { entries: number }; children: { _count: { entries: number } }[] }[];
  } | null;
}): ExternalBookRow {
  const root = book.rootCategory;
  const unitReady = root?.children.reduce((sum, unit) => sum + unit._count.entries, 0) ?? 0;
  const lessonReady = root?.children.reduce((sum, unit) => sum + unit.children.reduce((s, l) => s + l._count.entries, 0), 0) ?? 0;
  return {
    id: book.id,
    title: book.title,
    coverKey: book.coverKey,
    archived: book.archivedAt !== null,
    courseId: book.courseId,
    categoryId: root?.id ?? '',
    ready: (root?._count.entries ?? 0) + unitReady + lessonReady,
    units: root?.children.length ?? 0,
  };
}
