import { Injectable } from '@nestjs/common';
import type { Taxonomy } from '@ayman/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/** Codes pinned to the top of the governorate dropdown for UX. */
const PINNED_GOVERNORATE_CODES = ['01', '21', '02'];

@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The whole onboarding taxonomy in one round trip. It is small, changes rarely,
   * and every consumer needs all of it, so splitting it into three endpoints would
   * only add waterfalls.
   */
  async getTaxonomy(): Promise<Taxonomy> {
    const [governorates, systems] = await Promise.all([
      this.prisma.governorate.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { code: true, nameAr: true, slug: true, region: true, sortOrder: true },
      }),
      this.prisma.educationSystem.findMany({
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          slug: true,
          nameAr: true,
          totalMarks: true,
          passPercent: true,
          allowsRetakes: true,
          years: {
            orderBy: { sortOrder: 'asc' },
            select: { year: true, labelAr: true, badgeAr: true },
          },
          tracks: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, slug: true, labelAr: true, minYear: true },
          },
        },
      }),
    ]);

    return {
      governorates,
      pinnedGovernorateCodes: PINNED_GOVERNORATE_CODES,
      // Prisma returns Decimal for numeric columns; the contract says number.
      systems: systems.map((system) => ({
        ...system,
        passPercent: Number(system.passPercent),
      })),
    };
  }
}
