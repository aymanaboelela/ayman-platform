import { Injectable } from '@nestjs/common';
import { ARENA_RULES } from '@ayman/contracts/arena';
import { arenaCopy } from '@ayman/contracts/copy/arena';
import { formatCopy } from '@ayman/contracts/format';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { courseAccessScopes, hasLiveCourseAccess, type ScopedGrant } from '../entitlement/grant-liveness';
import { shortName } from '../progress/cohort-rank.service';
import { GameService } from '../quiz/game.service';
import type { ArenaCohort } from './arena-matchmaking';
import type { ArenaAccessPort, ArenaEligibility } from './arena.ports';

/** اللوبي والـ«يلا نبدأ» ورا بعض بثواني — البنك تقيل، فمش مرتين. */
const CACHE_MS = 20_000;

/**
 * مين يقدر يدخل الساحة، وفي أنهي كورس.
 *
 * ## «مشترك» = اشتراك مدفوع شغّال، بالقواعد اللي موجودة
 *
 * نفس `courseAccessScopes` / `hasLiveCourseAccess` اللي `EntitlementService`
 * و«كورساتي» بيحكموا بيهم — مش لستة scopes مكتوبة هنا تاني
 * (`scope-lists-predate-course-month`). الفرق الوحيد إن الكورس بيتسأل كأنه
 * `requiresGrant`: ده بالظبط اللي بيشيل الـgrant المجاني `platform` ويسيب
 * الكورس، والمادة، والترم، والشهر. فاللي اشترى «شهر ٢» بس مشترك، واللي
 * واخد الكورس المجاني بس مش مشترك.
 *
 * وأكواد المحاضرة/الوحدة (`lesson`/`section`) مش في `courseAccessScopes` من
 * الأساس (`unlock-codes-gate`)، فاللي اشترى محاضرة واحدة بكود مش «مشترك في
 * الكورس» هنا — وده المقصود: الماتش على أسئلة الكورس كله.
 *
 * وجنبها: اشتراك في الكورس (enrollment) شغّال، والكورس منشور.
 */
@Injectable()
export class ArenaAccessService implements ArenaAccessPort {
  private readonly cache = new Map<string, { at: number; value: ArenaEligibility }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
  ) {}

  async eligibility(userId: string): Promise<ArenaEligibility> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const value = await this.compute(userId);
    this.cache.set(userId, { at: Date.now(), value });
    if (this.cache.size > 5_000) this.cache.clear();
    return value;
  }

  private async compute(userId: string): Promise<ArenaEligibility> {
    const [user, profile] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, image: true } }),
      this.prisma.studentProfile.findUnique({
        where: { userId },
        select: { fullName: true, year: true, systemId: true, schoolStream: true },
      }),
    ]);
    const name = shortName(profile?.fullName || user?.name || '') || (user?.name ?? '');
    const image = user?.image ?? null;

    if (profile?.year == null) {
      return { name, image, cohort: null, cohortLabel: '', blocked: 'no_year', courses: [] };
    }
    const cohort: ArenaCohort = {
      systemId: profile.systemId,
      year: profile.year,
      stream: profile.schoolStream ?? null,
    };
    const [cohortLabel, paid] = await Promise.all([this.cohortLabel(cohort), this.paidCourses(userId)]);
    if (paid.length === 0) {
      return { name, image, cohort, cohortLabel, blocked: 'no_subscription', courses: [] };
    }

    const counts = await this.game.arenaPoolCounts(userId);
    const courses = paid.map((course) => {
      const questions = counts.get(course.id) ?? 0;
      return { id: course.id, title: course.title, questions, playable: questions >= ARENA_RULES.minPool };
    });
    courses.sort((a, b) => Number(b.playable) - Number(a.playable) || b.questions - a.questions);
    return { name, image, cohort, cohortLabel, blocked: null, courses };
  }

  /** «الصف الثاني بكالوريا · عربي». */
  private async cohortLabel(cohort: ArenaCohort): Promise<string> {
    const year = await this.prisma.academicYear.findFirst({
      where: { year: cohort.year, ...(cohort.systemId ? { systemId: cohort.systemId } : {}) },
      orderBy: { system: { sortOrder: 'asc' } },
      select: { labelAr: true },
    });
    const yearLabel = year?.labelAr ?? '';
    if (!cohort.stream) return yearLabel;
    return formatCopy(arenaCopy.cohort.label, { year: yearLabel, stream: arenaCopy.cohort[cohort.stream] });
  }

  /** كورسات منشورة، فيها اشتراك شغّال، وgrant **مدفوع** حي بيغطّيها. */
  private async paidCourses(userId: string): Promise<Array<{ id: string; title: string }>> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] }, course: { status: 'published' } },
      select: { course: { select: { id: true, title: true, subjectId: true } } },
    });
    if (enrollments.length === 0) return [];
    // `requiresGrant: true` = من غير `platform`. شوف الشرح فوق الكلاس.
    const subjects = enrollments.map(({ course }) => ({ id: course.id, subjectId: course.subjectId, requiresGrant: true }));
    const grants: ScopedGrant[] = await this.prisma.accessGrant.findMany({
      where: { userId, OR: subjects.flatMap(courseAccessScopes) },
      select: { scope: true, courseId: true, subjectId: true, validFrom: true, validUntil: true, revokedAt: true },
    });
    const now = new Date();
    return enrollments
      .filter((_, index) => hasLiveCourseAccess(grants, subjects[index]!, now))
      .map(({ course }) => ({ id: course.id, title: course.title }));
  }
}
