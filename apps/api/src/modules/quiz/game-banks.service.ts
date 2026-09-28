import { Injectable, NotFoundException } from '@nestjs/common';
import type { GameBankEnsureResult, GameBanks } from '@ayman/contracts/quiz/game';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * «أسئلة الألعاب» — تصنيف في بنك الأسئلة لكل كورس (`gameCourseId`).
 *
 * الأسئلة نفسها بتتكتب وتتلصق بالجملة بأدوات البنك الموجودة
 * (`POST /api/admin/questions/bulk` بـ`categoryId`) — الخدمة دي بس بتعرف أنهي
 * تصنيف بتاع أنهي كورس، وبتعمله أول مرة.
 */
@Injectable()
export class GameBanksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<GameBanks> {
    const courses = await this.prisma.course.findMany({
      where: { status: { not: 'archived' } },
      orderBy: [{ status: 'desc' }, { title: 'asc' }],
      select: {
        id: true,
        title: true,
        gameQuestionBank: {
          select: {
            id: true,
            _count: { select: { entries: { where: { versions: { some: { status: 'ready' } } } } } },
          },
        },
      },
    });
    return {
      rows: courses.map((course) => ({
        courseId: course.id,
        courseTitle: course.title,
        categoryId: course.gameQuestionBank?.id ?? null,
        ready: course.gameQuestionBank?._count.entries ?? 0,
      })),
    };
  }

  /** التصنيف بتاع الكورس، ولو مش موجود بيتعمل. مرتين في نفس اللحظة = واحد (UNIQUE). */
  async ensure(courseId: string): Promise<GameBankEnsureResult> {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { title: true } });
    if (!course) throw new NotFoundException();
    const name = `ألعاب — ${course.title}`;
    const category = await this.prisma.questionCategory.upsert({
      where: { gameCourseId: courseId },
      update: {},
      create: { name, gameCourseId: courseId },
      select: { id: true, name: true },
    });
    return { categoryId: category.id, categoryName: category.name };
  }
}
