import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminHonorBoard,
  AdminHonorPinCreate,
  AdminHonorPinPatch,
  AdminHonorPinRow,
  AdminHonorStudents,
} from '@ayman/contracts/admin/honor-board';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { chipFromProfile, courseChip, honorDayKey } from '../../catalog/honor-board';
import { AUDIT_RESOURCES } from '../admin.constants';

/**
 * لوحة الشرف من ناحية المدرّس — «دوّر على الطالب وحطه».
 *
 * الشاشة العامة بتتبني من مصدرين (اقرا `modules/catalog/honor-board.ts`)،
 * والسيرفس دي بتملك واحد فيهم: `honor_board_pins`. التاني — الورقة المثبّتة
 * — بيتقري هنا **للعرض بس**، عشان المدرّس يشوف اللوحة كلها من مكان واحد من
 * غير ما تبقى فيه طريقتين لنفس الحاجة على شاشتين.
 *
 * ## ⚠️ كل كتابة هنا بتنشر اسم طالب قاصر على صفحة عامة
 *
 * عشان كده تلات أكشنز في `audit_log` مش واحد، وعشان كده المسح بيسجّل الاسم
 * والسبب — بعده الصف بيبقى راح والسطر ده بيبقى الأثر الوحيد.
 */
@Injectable()
export class AdminHonorBoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * اليوم المصري كـinstant.
   *
   * الظهر مش نص الليل عن قصد: القاهرة +٢ في الشتا و+٣ في الصيف، وأي ساعة
   * قريبة من الحدود بتقع على اليوم اللي قبله أو اللي بعده في نص السنة.
   * الظهر بعيد عن الحدين، ف`honorDayKey` بيرجّع نفس اليوم اللي المدرّس
   * كتبه مهما كان التوقيت الصيفي شغّال أو لأ.
   */
  private instantFor(day: string): Date {
    return new Date(`${day}T12:00:00+02:00`);
  }

  /**
   * الأدوار، الأحدث الأول — الصفوف اليدوية والورق المثبّت في نفس اليوم
   * المصري، زي ما اللوحة العامة بتجمّعهم بالظبط.
   */
  async list(): Promise<AdminHonorBoard> {
    const [pins, attempts, courses] = await Promise.all([
      this.prisma.honorBoardPin.findMany({
        orderBy: [{ honoredAt: 'desc' }, { rank: 'asc' }, { createdAt: 'asc' }],
        take: 400,
        select: PIN_SELECT,
      }),
      /*
       * نفس شروط `CatalogService.honorBoard` بالحرف — نفس الـwhere ونفس
       * الترتيب — عشان الشاشة تعرض نفس الترتيب اللي على الموقع. اللي ناقص
       * هنا هو فلترة الورقة المتأخرة، وهي مقصودة: الورقة المتأخرة **مش**
       * بتوصل اللوحة العامة، والمدرّس اللي بيدوّر على «هو فين؟» لازم يشوفها
       * هنا مع سبب غيابها بدل ما تختفي من الشاشتين.
       */
      this.prisma.quizAttempt.findMany({
        where: { honorBoardAt: { not: null }, state: 'submitted' },
        orderBy: [
          { instructorRating: 'desc' },
          { scaledScore: 'desc' },
          { honorBoardAt: 'asc' },
        ],
        take: 400,
        select: {
          id: true,
          userId: true,
          startedAt: true,
          scaledScore: true,
          gradeOutOf: true,
          honorBoardAt: true,
          user: {
            select: {
              image: true,
              studentProfile: { select: { fullName: true, honorPhotoKey: true } },
            },
          },
          quiz: {
            select: {
              lateAfter: true,
              lesson: {
                select: {
                  title: true,
                  course: { select: { year: true, forGeneral: true, forLanguages: true } },
                },
              },
            },
          },
        },
      }),
      /* قايمة الاختيار في الديالوج. كل الكورسات مش المنشور بس: تكريم على
         كورس لسه مستنّي النشر حاجة واردة، والشارة بتتبني من السنة والشعبة
         مش من حالة النشر. */
      this.prisma.course.findMany({
        orderBy: [{ year: 'asc' }, { title: 'asc' }],
        select: { id: true, title: true, year: true, forGeneral: true, forLanguages: true },
      }),
    ]);

    const rounds = new Map<string, { manual: AdminHonorPinRow[]; fromExams: ExamRow[] }>();
    const round = (key: string) => {
      const found = rounds.get(key);
      if (found) return found;
      const fresh = { manual: [] as AdminHonorPinRow[], fromExams: [] as ExamRow[] };
      rounds.set(key, fresh);
      return fresh;
    };

    for (const pin of pins) round(honorDayKey(pin.honoredAt)).manual.push(toPinRow(pin));

    /* المركز على الورقة بيتحسب بنفس المشية بتاعت اللوحة العامة: ١، ٢، ٣ جوّه
       الكورس، بترتيب الريكويست. مش بيتحسب هنا من الأول — بيتمشّى على نفس
       الترتيب، فاللي المدرّس بيشوفه هو نفس اللي على الصفحة. */
    const walked = new Map<string, number>();
    for (const attempt of attempts) {
      const at = attempt.honorBoardAt as Date;
      const key = honorDayKey(at);
      const courseLabel = courseChip(attempt.quiz.lesson.course);
      const seen = `${key}::${courseLabel}`;
      const rank = (walked.get(seen) ?? 0) + 1;
      walked.set(seen, rank);
      const scaledScore = attempt.scaledScore === null ? null : Number(attempt.scaledScore);
      const gradeOutOf = Number(attempt.gradeOutOf);
      round(key).fromExams.push({
        attemptId: attempt.id,
        userId: attempt.userId,
        studentName: attempt.user.studentProfile?.fullName ?? '—',
        courseLabel,
        rank,
        title: attempt.quiz.lesson.title,
        scaledScore,
        gradeOutOf,
        percent:
          scaledScore !== null && gradeOutOf > 0
            ? Math.min(Math.max(Math.round((scaledScore / gradeOutOf) * 100), 0), 100)
            : null,
        photoKey: attempt.user.studentProfile?.honorPhotoKey ?? null,
        pinnedAt: at.toISOString(),
      });
    }

    return {
      rounds: [...rounds.entries()]
        // مفاتيح `YYYY-MM-DD`، فمقارنة النصوص هي مقارنة التواريخ.
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, group]) => ({
          key,
          pinnedAt: newestOf(key, group),
          manual: group.manual,
          fromExams: group.fromExams,
        })),
      courses: courses.map((course) => ({
        id: course.id,
        title: course.title,
        label: courseChip(course),
      })),
    };
  }

  /**
   * البحث في ديالوج «ضيف طالب».
   *
   * بيدوّر بالاسم وبالتليفون: اتنين اسمهم «محمد أحمد» على نفس الدفعة حاجة
   * عادية، والتليفون هو اللي بيفرّق. الحد الأقصى ٢٥، والشاشة بتطلب ١٠ —
   * ده مش كشف أسماء، ده اختيار واحد.
   */
  async searchStudents(q: string, limit: number): Promise<AdminHonorStudents> {
    const rows = await this.prisma.studentProfile.findMany({
      where: {
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { fullName: 'asc' },
      take: limit,
      select: {
        userId: true,
        fullName: true,
        phone: true,
        governorateCode: true,
        year: true,
        schoolStream: true,
        honorPhotoKey: true,
        user: { select: { _count: { select: { honorPins: true } } } },
      },
    });

    return {
      students: rows.map((row) => ({
        userId: row.userId,
        fullName: row.fullName,
        phone: row.phone,
        governorateCode: row.governorateCode,
        year: row.year,
        stream: row.schoolStream,
        honorPhotoKey: row.honorPhotoKey,
        pinCount: row.user?._count.honorPins ?? 0,
      })),
    };
  }

  async create(input: AdminHonorPinCreate, actorId: string): Promise<AdminHonorPinRow> {
    // الطالب لازم يكون موجود وله بروفايل: الكارت بيطبع `fullName`، وصف
    // لحساب من غير بروفايل كان هيطلع على الصفحة الرئيسية باسم «—».
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: input.userId },
      select: { userId: true },
    });
    if (!profile) throw new NotFoundException('الطالب ده مش موجود');

    /*
     * الصف والإشعار في ترانزاكشن واحدة.
     *
     * الإشعار هو الحاجة الوحيدة اللي بتقول للطالب إن اسمه اتنشر — اللوحة
     * صفحة عامة مالوش سبب يفتحها. فلو الصف اتكتب والإشعار وقع، اسمه بيبقى
     * منشور وهو مايعرفش. والعكس — إشعار من غير صف — أسوأ: «مبروك» على لوحة
     * مفيهاش اسمه.
     *
     * النص الحي (`announce`) بره الترانزاكشن، زي كل نداء تاني للفيد: ده
     * إشعار المتصفح، ولو ريديس واقع الصف لسه في الفيد.
     */
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.honorBoardPin.create({
        data: {
          userId: input.userId,
          honoredAt: this.instantFor(input.day),
          rank: input.rank,
          courseId: input.courseId,
          reason: input.reason,
          photoKey: input.photoKey,
          createdById: actorId,
        },
        select: PIN_SELECT,
      });
      await this.notifications.emit(tx, {
        userId: input.userId,
        kind: 'honor_board_listed',
        pinId: row.id,
      });
      return row;
    });

    await this.audit.record({
      action: 'honor:add',
      resourceType: AUDIT_RESOURCES.honorBoardPin,
      resourceId: created.id,
      outcome: 'success',
      metadata: { userId: input.userId, day: input.day, rank: input.rank, reason: input.reason },
    });

    await this.notifications.announce(input.userId);

    return toPinRow(created);
  }

  async patch(id: string, input: AdminHonorPinPatch): Promise<AdminHonorPinRow> {
    const existing = await this.prisma.honorBoardPin.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('التكريم ده مش موجود');

    const updated = await this.prisma.honorBoardPin.update({
      where: { id },
      data: {
        // كل واحدة فيهم بتتكتب لو اتبعتت بس — `AdminHonorPinPatchSchema`
        // متكتوب بالإيد عشان `.partial()` مايحقنش `null` جوّه بايلود
        // مابيتكلّمش عن الصورة أصلاً ويمسحها.
        ...(input.day === undefined ? {} : { honoredAt: this.instantFor(input.day) }),
        ...(input.rank === undefined ? {} : { rank: input.rank }),
        ...(input.courseId === undefined ? {} : { courseId: input.courseId }),
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        ...(input.photoKey === undefined ? {} : { photoKey: input.photoKey }),
      },
      select: PIN_SELECT,
    });

    await this.audit.record({
      action: 'honor:update',
      resourceType: AUDIT_RESOURCES.honorBoardPin,
      resourceId: id,
      outcome: 'success',
      metadata: { changed: Object.keys(input) },
    });

    return toPinRow(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.honorBoardPin.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        honoredAt: true,
        rank: true,
        reason: true,
        user: { select: { studentProfile: { select: { fullName: true } } } },
      },
    });
    if (!existing) throw new NotFoundException('التكريم ده مش موجود');

    await this.prisma.honorBoardPin.delete({ where: { id } });

    await this.audit.record({
      action: 'honor:remove',
      resourceType: AUDIT_RESOURCES.honorBoardPin,
      resourceId: id,
      outcome: 'success',
      // الاسم والسبب هنا مش زيادة: بعد الـDELETE ده الأثر الوحيد إن الصف كان
      // موجود، و«مين شال اسم الطالب ده» سؤال بيتسأل.
      metadata: {
        userId: existing.userId,
        studentName: existing.user.studentProfile?.fullName ?? null,
        day: honorDayKey(existing.honoredAt),
        rank: existing.rank,
        reason: existing.reason,
      },
    });
  }
}

const PIN_SELECT = {
  id: true,
  userId: true,
  honoredAt: true,
  rank: true,
  courseId: true,
  reason: true,
  photoKey: true,
  createdAt: true,
  course: { select: { year: true, forGeneral: true, forLanguages: true } },
  user: {
    select: {
      studentProfile: {
        select: {
          fullName: true,
          phone: true,
          honorPhotoKey: true,
          year: true,
          schoolStream: true,
        },
      },
    },
  },
} as const;

interface PinRow {
  id: string;
  userId: string;
  honoredAt: Date;
  rank: number;
  courseId: string | null;
  reason: string;
  photoKey: string | null;
  createdAt: Date;
  course: { year: number; forGeneral: boolean; forLanguages: boolean } | null;
  user: {
    studentProfile: {
      fullName: string;
      phone: string;
      honorPhotoKey: string | null;
      year: number | null;
      schoolStream: string | null;
    } | null;
  };
}

type ExamRow = AdminHonorBoard['rounds'][number]['fromExams'][number];

function toPinRow(row: PinRow): AdminHonorPinRow {
  const profile = row.user.studentProfile;
  return {
    id: row.id,
    userId: row.userId,
    studentName: profile?.fullName ?? '—',
    phone: profile?.phone ?? null,
    day: honorDayKey(row.honoredAt),
    honoredAt: row.honoredAt.toISOString(),
    rank: row.rank,
    courseId: row.courseId,
    // نفس الشارة اللي هتتطبع على الكارت بالحرف — الشاشة بتعرض اللي هينزل،
    // مش وصف ليه.
    courseLabel: row.course ? courseChip(row.course) : chipFromProfile(profile),
    reason: row.reason,
    photoKey: row.photoKey,
    profilePhotoKey: profile?.honorPhotoKey ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** أحدث حاجة في الدور — بتاريخها الحقيقي، عشان الشاشة تطبع يوم مش مفتاح. */
function newestOf(key: string, group: { manual: AdminHonorPinRow[]; fromExams: ExamRow[] }): string {
  const stamps = [
    ...group.manual.map((row) => Date.parse(row.honoredAt)),
    ...group.fromExams.map((row) => Date.parse(row.pinnedAt)),
  ];
  // الدور مابيتعملش من غير صف واحد على الأقل، فالـfallback ده مايحصلش —
  // موجود عشان `Math.max` على ليستة فاضية بيرجّع `-Infinity` و`toISOString`
  // بترمي عليه.
  if (stamps.length === 0) return new Date(`${key}T12:00:00+02:00`).toISOString();
  return new Date(Math.max(...stamps)).toISOString();
}
