import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { SectionCreateInput, SectionUpdateInput } from '@ayman/contracts/content';
import { PrismaService } from '../../prisma/prisma.service';
import { buildReorderSql } from './reorder.sql';

@Injectable()
export class SectionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Appends. Positions are contiguous from 0 and only the reorder endpoint rewrites them. */
  async create(courseId: string, input: SectionCreateInput) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) throw new NotFoundException();

    const last = await this.prisma.courseSection.findFirst({
      where: { courseId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });

    return this.prisma.courseSection.create({
      data: {
        courseId,
        title: input.title,
        summary: input.summary,
        isPublished: input.isPublished,
        position: last === null ? 0 : last.position + 1,
      },
    });
  }

  async update(id: string, input: SectionUpdateInput) {
    const section = await this.prisma.courseSection.findUnique({ where: { id }, select: { id: true } });
    if (!section) throw new NotFoundException();
    return this.prisma.courseSection.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.summary !== undefined && { summary: input.summary }),
        ...(input.isPublished !== undefined && { isPublished: input.isPublished }),
      },
    });
  }

  /**
   * Deleting closes the gap in the same transaction. Leaving holes "because the
   * order still reads correctly" is how a section ends up at position 47 with
   * six siblings, and every later reorder diff becomes unreadable.
   */
  async remove(id: string): Promise<{ id: string }> {
    const section = await this.prisma.courseSection.findUnique({
      where: { id },
      select: { id: true, courseId: true, position: true },
    });
    if (!section) throw new NotFoundException();

    await this.prisma.$transaction([
      this.prisma.courseSection.delete({ where: { id } }),
      this.prisma.courseSection.updateMany({
        where: { courseId: section.courseId, position: { gt: section.position } },
        data: { position: { decrement: 1 } },
      }),
    ]);
    return { id };
  }

  /** Mirrors LessonService.reorder — see that method's comment for the threat model. */
  async reorder(courseId: string, orderedIds: string[]): Promise<{ updated: number }> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.courseSection.findMany({
        where: { courseId },
        select: { id: true },
      });
      const currentIds = new Set(current.map((section) => section.id));

      if (orderedIds.length !== currentIds.size) {
        throw new BadRequestException('the ordered array must contain every section in the course');
      }
      for (const id of orderedIds) {
        if (!currentIds.has(id)) {
          throw new BadRequestException('the ordered array contains an id from another course');
        }
      }

      const updated = await tx.$executeRaw(
        buildReorderSql('course_sections', 'course_id', courseId, orderedIds),
      );
      if (updated !== orderedIds.length) {
        throw new BadRequestException('reorder touched an unexpected number of rows');
      }
      return { updated };
    });
  }
}
