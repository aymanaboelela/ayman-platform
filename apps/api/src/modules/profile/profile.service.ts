import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { Onboarding } from '@ayman/contracts';
import { Prisma, type StudentProfile } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ProfileMeResponse {
  userId: string;
  onboardingCompleted: boolean;
  profile: StudentProfile | null;
}

/** Postgres unique-violation error code, used to translate a phone collision into a 409. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<ProfileMeResponse> {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId } });
    return {
      userId,
      onboardingCompleted: profile?.onboardingCompletedAt != null,
      profile: profile ?? null,
    };
  }

  /**
   * §5.2 onboarding write path. `input` has already been shape-validated by
   * `OnboardingSchema` (via the controller's Zod DTO pipe) — that only proves
   * the payload is WELL-FORMED. What it can't prove is that the referenced
   * ids are LEGITIMATE: a client can submit a syntactically valid UUID for a
   * ثانوية عامة track while claiming `system: 'bacalorya'`. This method
   * re-checks every cross-field reference against the real database before
   * writing anything (S10) — never trust that Zod already covered it.
   */
  async completeOnboarding(userId: string, input: Onboarding): Promise<StudentProfile> {
    const governorate = await this.prisma.governorate.findUnique({
      where: { code: input.governorateCode },
      select: { code: true },
    });
    if (!governorate) {
      throw new BadRequestException('governorateCode does not match a known governorate');
    }

    // `system` is a stable slug (see onboarding.ts's own comment on why —
    // EducationSystem.id is a random uuid7, not something a shared Zod
    // schema can hardcode) — resolve it to the real FK id here.
    let systemId: string | null = null;
    if (input.system !== undefined) {
      const system = await this.prisma.educationSystem.findUnique({
        where: { slug: input.system },
        select: { id: true },
      });
      if (!system) {
        throw new BadRequestException('system does not match a known education system');
      }
      systemId = system.id;
    }

    // OnboardingSchema's own refinements already guarantee trackId implies
    // system is present, and electiveSubjectId implies trackId is present —
    // but they say nothing about whether trackId/electiveSubjectId are real
    // rows, or whether they actually belong together. That's this block.
    let trackId: string | null = null;
    if (input.trackId !== undefined) {
      const track = await this.prisma.track.findUnique({
        where: { id: input.trackId },
        select: { id: true, systemId: true },
      });
      if (!track || track.systemId !== systemId) {
        throw new BadRequestException('trackId does not belong to the selected system');
      }
      trackId = track.id;
    }

    let electiveSubjectId: string | null = null;
    if (input.electiveSubjectId !== undefined) {
      const offering = await this.prisma.subjectOffering.findUnique({
        where: { id: input.electiveSubjectId },
        select: { id: true, trackId: true, year: true, electiveGroupId: true },
      });
      const isValidElectiveForTrackAndYear =
        offering !== null &&
        offering.electiveGroupId !== null &&
        offering.trackId === trackId &&
        offering.year === input.year;
      if (!isValidElectiveForTrackAndYear) {
        throw new BadRequestException(
          'electiveSubjectId is not one of the available options for the selected track and year',
        );
      }
      electiveSubjectId = offering.id;
    }

    const data = {
      fullName: input.fullName,
      gender: input.gender,
      phone: input.phone,
      governorateCode: input.governorateCode,
      schoolName: input.schoolName ?? null,
      fatherPhone: input.fatherPhone ?? null,
      motherPhone: input.motherPhone ?? null,
      systemId,
      year: input.year ?? null,
      trackId,
      electiveSubjectId,
      onboardingCompletedAt: new Date(),
    };

    try {
      return await this.prisma.studentProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === PRISMA_UNIQUE_VIOLATION) {
        throw new ConflictException('phone is already registered to another profile');
      }
      throw error;
    }
  }
}
