import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import {
  HONOR_EXAM_CANDIDATES,
  type AdminHonorBoard,
  type AdminHonorCandidate,
  type AdminHonorExamBoard,
  type AdminHonorExamList,
  type AdminHonorExamPublish,
  type AdminHonorExamPublishResult,
  type AdminHonorPinCreate,
  type AdminHonorPinPatch,
  type AdminHonorPinRow,
  type AdminHonorStudents,
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
                  course: { select: { year: true, forGeneral: true, forLanguages: true, system: { select: { slug: true } } } },
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
        select: { id: true, title: true, year: true, forGeneral: true, forLanguages: true, system: { select: { slug: true } } },
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

  /**
   * «الأوائل من امتحان الشهر» — the month exams the picker offers, newest
   * first, each with how many on-time papers it has and how many of them are
   * on the board already.
   */
  async listExams(): Promise<AdminHonorExamList> {
    const lessons = await this.prisma.lesson.findMany({
      where: { kind: 'quiz', section: { title: EXAM_SHELF_TITLE }, quiz: { isNot: null } },
      select: {
        id: true,
        title: true,
        course: { select: { title: true, year: true, forGeneral: true, forLanguages: true, system: { select: { slug: true } } } },
        quiz: { select: { id: true, openFrom: true, lateAfter: true } },
      },
    });
    const quizIds = lessons.flatMap((lesson) => (lesson.quiz ? [lesson.quiz.id] : []));
    if (quizIds.length === 0) return { exams: [] };

    // Two grouped counts instead of one per exam. «late» compares two columns,
    // which Prisma's `where` cannot, hence raw SQL for the first.
    const [satRows, pinnedRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ quiz_id: string; sat: number }>>`
        SELECT a."quiz_id" AS quiz_id, count(DISTINCT a."user_id")::int AS sat
        FROM "app"."quiz_attempts" a
        JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
        WHERE a."quiz_id" = ANY(${quizIds}::uuid[])
          AND a."state" = 'submitted'
          AND (q."late_after" IS NULL OR a."started_at" <= q."late_after")
        GROUP BY a."quiz_id"`,
      this.prisma.$queryRaw<Array<{ quiz_id: string; pinned: number }>>`
        SELECT a."quiz_id" AS quiz_id, count(*)::int AS pinned
        FROM "app"."honor_board_pins" p
        JOIN "app"."quiz_attempts" a ON a."id" = p."attempt_id"
        WHERE a."quiz_id" = ANY(${quizIds}::uuid[])
        GROUP BY a."quiz_id"`,
    ]);
    const sat = new Map(satRows.map((row) => [row.quiz_id, row.sat]));
    const pinned = new Map(pinnedRows.map((row) => [row.quiz_id, row.pinned]));

    const exams = lessons
      .filter((lesson) => lesson.quiz !== null)
      .map((lesson) => {
        const quiz = lesson.quiz as NonNullable<typeof lesson.quiz>;
        return {
          lessonId: lesson.id,
          title: lesson.title,
          courseTitle: lesson.course.title,
          courseLabel: courseChip(lesson.course),
          opensAt: quiz.openFrom?.toISOString() ?? null,
          sat: sat.get(quiz.id) ?? 0,
          pinned: pinned.get(quiz.id) ?? 0,
        };
      })
      // An exam nobody has sat has no board to build; it would only push the
      // ones that do down the list.
      .filter((exam) => exam.sat > 0)
      .sort((a, b) => (b.opensAt ?? '').localeCompare(a.opensAt ?? ''));

    return { exams };
  }

  /**
   * One exam's best papers — the best on-time sitting of each student, in
   * the order the grading screen's «الأوائل» uses (his rating first, then the
   * percentage) — with the place each holds on the board now.
   */
  async examBoard(lessonId: string): Promise<AdminHonorExamBoard> {
    const exam = await this.requireExam(lessonId);

    const best = await this.prisma.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        scaled_score: unknown;
        grade_out_of: unknown;
        instructor_rating: number | null;
      }>
    >`
      SELECT id, user_id, scaled_score, grade_out_of, instructor_rating
      FROM (
        SELECT DISTINCT ON (a."user_id")
          a."id", a."user_id", a."scaled_score", a."grade_out_of",
          a."instructor_rating", a."submitted_at",
          CASE WHEN a."grade_out_of" > 0 THEN a."scaled_score" / a."grade_out_of" END AS ratio
        FROM "app"."quiz_attempts" a
        JOIN "app"."quizzes" q ON q."id" = a."quiz_id"
        WHERE a."quiz_id" = ${exam.quizId}::uuid
          AND a."state" = 'submitted'
          AND (q."late_after" IS NULL OR a."started_at" <= q."late_after")
        ORDER BY a."user_id", a."instructor_rating" DESC NULLS LAST, ratio DESC NULLS LAST, a."id" ASC
      ) b
      ORDER BY instructor_rating DESC NULLS LAST, ratio DESC NULLS LAST,
               submitted_at ASC NULLS LAST, id ASC
      LIMIT ${HONOR_EXAM_CANDIDATES}`;

    const pins = await this.prisma.honorBoardPin.findMany({
      where: { attempt: { quizId: exam.quizId } },
      select: {
        rank: true,
        honoredAt: true,
        attempt: {
          select: {
            id: true,
            userId: true,
            scaledScore: true,
            gradeOutOf: true,
            instructorRating: true,
          },
        },
      },
    });
    const pinnedRank = new Map<string, number>(
      pins.flatMap((pin) => (pin.attempt ? [[pin.attempt.id, pin.rank] as [string, number]] : [])),
    );

    // A paper already on the board stays listed even if it no longer sorts
    // into the top forty — otherwise he could not see it to take it off.
    const listed = new Set(best.map((row) => row.id));
    const rows = [
      ...best,
      ...pins.flatMap((pin) =>
        pin.attempt && !listed.has(pin.attempt.id)
          ? [
              {
                id: pin.attempt.id,
                user_id: pin.attempt.userId,
                scaled_score: pin.attempt.scaledScore,
                grade_out_of: pin.attempt.gradeOutOf,
                instructor_rating: pin.attempt.instructorRating,
              },
            ]
          : [],
      ),
    ];

    const profiles = await this.prisma.studentProfile.findMany({
      where: { userId: { in: [...new Set(rows.map((row) => row.user_id))] } },
      select: { userId: true, fullName: true, phone: true, honorPhotoKey: true },
    });
    const byUser = new Map(profiles.map((profile) => [profile.userId, profile]));

    const candidates: AdminHonorCandidate[] = rows.map((row) => {
      const profile = byUser.get(row.user_id);
      const scaledScore = row.scaled_score === null ? null : Number(row.scaled_score);
      const gradeOutOf = Number(row.grade_out_of);
      return {
        attemptId: row.id,
        userId: row.user_id,
        studentName: profile?.fullName ?? '—',
        phone: profile?.phone ?? null,
        photoKey: profile?.honorPhotoKey ?? null,
        scaledScore,
        gradeOutOf,
        percent:
          scaledScore !== null && gradeOutOf > 0
            ? Math.min(Math.max(Math.round((scaledScore / gradeOutOf) * 100), 0), 100)
            : null,
        instructorRating: row.instructor_rating,
        pinnedRank: pinnedRank.get(row.id) ?? null,
      };
    });

    return {
      lessonId: exam.lessonId,
      title: exam.title,
      courseLabel: courseChip(exam.course),
      day: pins[0] ? honorDayKey(pins[0].honoredAt) : null,
      candidates,
    };
  }

  /**
   * Publish one exam's top ten — the list is the whole board for that exam.
   *
   * Papers that stay keep their row (and the notification already sent for
   * it); only students who are NEW on the board are notified. Everything is
   * one transaction for the reason `create` gives: a name on a public page
   * without its notification, or the reverse, are both wrong.
   *
   * ⚠️ It also clears `honor_board_at` on this exam's papers. A paper pinned
   * from the grading screen AND ranked here would be the same student twice
   * on one board, with two different places; once he has ranked the exam
   * here, this list is the exam's board.
   */
  async publishExam(
    lessonId: string,
    input: AdminHonorExamPublish,
    actorId: string,
  ): Promise<AdminHonorExamPublishResult> {
    const exam = await this.requireExam(lessonId);
    const picked = input.picks.map((pick) => pick.attemptId);

    const papers = await this.prisma.quizAttempt.findMany({
      where: { id: { in: picked } },
      select: {
        id: true,
        userId: true,
        quizId: true,
        state: true,
        startedAt: true,
        quiz: { select: { lateAfter: true } },
      },
    });
    const paperById = new Map(papers.map((paper) => [paper.id, paper]));
    for (const id of picked) {
      const paper = paperById.get(id);
      // Same two refusals `ManualGradingService.mark` makes, for the same
      // reasons: a provisional total and a late sitting do not go on a board.
      if (!paper || paper.quizId !== exam.quizId) {
        throw new BadRequestException({ code: 'attempt_not_in_exam' });
      }
      if (paper.state !== 'submitted') {
        throw new BadRequestException({ code: 'attempt_not_finished' });
      }
      if (paper.quiz.lateAfter !== null && paper.startedAt > paper.quiz.lateAfter) {
        throw new BadRequestException({ code: 'attempt_is_late' });
      }
    }
    if (new Set(papers.map((paper) => paper.userId)).size !== papers.length) {
      throw new BadRequestException({ code: 'student_picked_twice' });
    }

    const honoredAt = this.instantFor(input.day);
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.honorBoardPin.findMany({
        where: { attempt: { quizId: exam.quizId } },
        select: { id: true, attemptId: true, userId: true },
      });
      const keep = new Set(picked);
      const stale = existing.filter((pin) => !pin.attemptId || !keep.has(pin.attemptId));
      if (stale.length > 0) {
        await tx.honorBoardPin.deleteMany({ where: { id: { in: stale.map((pin) => pin.id) } } });
      }

      const pinByAttempt = new Map(existing.map((pin) => [pin.attemptId, pin]));
      const fresh: string[] = [];
      let updated = 0;

      /* Ranks are unique per exam, but the rows being moved still hold their
         old ones while the loop runs — and nothing forbids two rows sharing a
         rank in the table, so a straight walk is safe. */
      for (const pick of input.picks) {
        const paper = paperById.get(pick.attemptId) as (typeof papers)[number];
        const data = {
          honoredAt,
          rank: pick.rank,
          courseId: exam.courseId,
          reason: exam.title,
        };
        const current = pinByAttempt.get(pick.attemptId);
        if (current) {
          await tx.honorBoardPin.update({ where: { id: current.id }, data });
          updated += 1;
        } else {
          const row = await tx.honorBoardPin.create({
            data: { ...data, userId: paper.userId, attemptId: pick.attemptId, createdById: actorId },
            select: { id: true },
          });
          await this.notifications.emit(tx, {
            userId: paper.userId,
            kind: 'honor_board_listed',
            pinId: row.id,
          });
          fresh.push(paper.userId);
        }
        if (pick.photoKey !== undefined) {
          await tx.studentProfile.updateMany({
            where: { userId: paper.userId },
            data: { honorPhotoKey: pick.photoKey },
          });
        }
      }

      await tx.quizAttempt.updateMany({
        where: { quizId: exam.quizId, honorBoardAt: { not: null } },
        data: { honorBoardAt: null },
      });

      return { added: fresh.length, updated, removed: stale.length, fresh };
    });

    await this.audit.record({
      action: 'honor:publish-exam',
      resourceType: AUDIT_RESOURCES.honorBoardPin,
      resourceId: exam.lessonId,
      outcome: 'success',
      metadata: {
        day: input.day,
        picks: input.picks.map((pick) => ({ attemptId: pick.attemptId, rank: pick.rank })),
        added: result.added,
        updated: result.updated,
        removed: result.removed,
      },
    });

    if (result.fresh.length > 0) await this.notifications.announceAll(result.fresh);

    return { added: result.added, updated: result.updated, removed: result.removed };
  }

  private async requireExam(lessonId: string) {
    // A malformed id is a missing exam, not a Prisma 500 on the uuid cast.
    if (!UUID.test(lessonId)) throw new NotFoundException('الامتحان ده مش موجود');
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, kind: 'quiz', section: { title: EXAM_SHELF_TITLE } },
      select: {
        id: true,
        title: true,
        courseId: true,
        course: { select: { year: true, forGeneral: true, forLanguages: true, system: { select: { slug: true } } } },
        quiz: { select: { id: true } },
      },
    });
    if (!lesson?.quiz) throw new NotFoundException('الامتحان ده مش موجود');
    return {
      lessonId: lesson.id,
      title: lesson.title,
      courseId: lesson.courseId,
      course: lesson.course,
      quizId: lesson.quiz.id,
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PIN_SELECT = {
  id: true,
  userId: true,
  honoredAt: true,
  rank: true,
  courseId: true,
  reason: true,
  photoKey: true,
  attemptId: true,
  createdAt: true,
  course: { select: { year: true, forGeneral: true, forLanguages: true, system: { select: { slug: true } } } },
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
  attemptId: string | null;
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
    attemptId: row.attemptId,
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
