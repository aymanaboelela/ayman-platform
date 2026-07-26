import { Injectable, NotFoundException } from '@nestjs/common';
import type { SectionCreateInput, SectionUpdateInput } from '@ayman/contracts/content';
import { PrismaService } from '../../prisma/prisma.service';

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
}
