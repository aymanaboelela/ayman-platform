import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Onboarding, StudentSection } from '@ayman/contracts';
import { Prisma, type StudentProfile } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService, type UploadFile } from '../media/media.service';

export interface ProfileMeResponse {
  userId: string;
  onboardingCompleted: boolean;
  profile: StudentProfile | null;
}

/** Postgres unique-violation error code, used to translate a phone collision into a 409. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async getMe(userId: string): Promise<ProfileMeResponse> {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId } });
    return {
      userId,
      onboardingCompleted: profile?.onboardingCompletedAt != null,
      profile: profile ?? null,
    };
  }

  /**
   * Replaces the student's profile photo.
   *
   * ## What gets stored in `User.image`
   *
   * A STORAGE KEY for our own uploads (`ab/abcd….webp`), not a URL. Media URLs
   * are reconstructed at render time from `NEXT_PUBLIC_MEDIA_ORIGIN`, never
   * persisted — see `mediaUrl()` in `@ayman/ui/branding` — because the media
   * origin is deliberately a different host from the app and baking today's
   * value into a user row makes moving it a data migration.
   *
   * The same column also holds full `https://lh3.googleusercontent.com/…` URLs
   * for Google sign-ups, which is why the client resolves it with "starts with
   * http? use as-is, otherwise treat as a key" rather than assuming either.
   *
   * ## The previous photo is archived, not deleted
   *
   * `media_assets` rows are referenced by admin screens, and a hard delete on
   * a table other people's rows live in is a far bigger blast radius than a
   * soft flag on one row. The bytes stay; the asset stops appearing in the
   * library.
   *
   * The upload's own four gates (extension, magic bytes, sharp re-encode, UUID
   * key) live in `MediaService.uploadAvatar`. Nothing here inspects the file.
   */
  async setAvatar(userId: string, file: UploadFile): Promise<{ image: string }> {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { image: true },
    });

    const asset = await this.media.uploadAvatar(file);

    await this.prisma.user.update({
      where: { id: userId },
      data: { image: asset.storageKey },
    });

    // Only OUR assets are archivable — a Google URL has no `media_assets` row,
    // and `updateMany` (not `update`) means a key with no matching row is a
    // no-op rather than a thrown P2025 that would fail a request whose real
    // work already succeeded.
    if (current.image && !current.image.startsWith('http')) {
      await this.prisma.mediaAsset.updateMany({
        where: { storageKey: current.image, archivedAt: null },
        data: { archivedAt: new Date() },
      });
    }

    return { image: asset.storageKey };
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
  /**
   * S10: resolves the four section fields against the DATABASE.
   *
   * The shared Zod refinement (`refineSection`, in `@ayman/contracts`) proves
   * the payload's internal consistency — a track implies a system, an elective
   * implies a track, year 1 has no track. What it cannot do, because it never
   * sees a row, is confirm that any of those ids EXIST or that they belong
   * together. That is this method, and both the onboarding wizard and the
   * section editor go through it, so there is exactly one definition of a
   * legal section on the server.
   */
  private async resolveSection(input: StudentSection): Promise<{
    systemId: string | null;
    year: number | null;
    trackId: string | null;
    electiveSubjectId: string | null;
  }> {
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

    return { systemId, year: input.year ?? null, trackId, electiveSubjectId };
  }

  /**
   * The student changing their year/track after onboarding — «غيّر صفّك».
   *
   * ## Why this writes four columns and nothing else
   *
   * The obvious alternative was to let the editor resubmit the whole
   * onboarding payload. That makes a screen about the academic section
   * responsible for a name, a gender, a unique phone number and two parent
   * phones — every one of which it would have to round-trip correctly or
   * silently clobber. A narrow route cannot clobber what it cannot write.
   *
   * ## What it deliberately does NOT do
   *
   * Touch progress. Enrollments, lesson progress and quiz attempts are
   * untouched by a section change, so switching away shows a course list with
   * no history against it and switching back shows every number intact. That
   * is the whole of the "reset to zero / bring it all back" requirement, and
   * a literal reset would make the second half impossible.
   *
   * 404 rather than an upsert when there is no profile: this route edits an
   * existing section, and a student who has never onboarded has no identity
   * fields for it to create a row around.
   */
  async updateSection(userId: string, input: StudentSection): Promise<StudentProfile> {
    const existing = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });
    if (!existing) {
      throw new NotFoundException('no profile to update — complete onboarding first');
    }

    const section = await this.resolveSection(input);

    return this.prisma.studentProfile.update({ where: { userId }, data: section });
  }

  async completeOnboarding(userId: string, input: Onboarding): Promise<StudentProfile> {
    const governorate = await this.prisma.governorate.findUnique({
      where: { code: input.governorateCode },
      select: { code: true },
    });
    if (!governorate) {
      throw new BadRequestException('governorateCode does not match a known governorate');
    }

    const { systemId, year, trackId, electiveSubjectId } = await this.resolveSection(input);

    const data = {
      fullName: input.fullName,
      gender: input.gender,
      phone: input.phone,
      governorateCode: input.governorateCode,
      schoolName: input.schoolName ?? null,
      schoolStream: input.schoolStream,
      fatherPhone: input.fatherPhone,
      // `motherPhone` is deliberately absent, not set to null: onboarding
      // stopped asking for it, and writing null would DELETE the number a
      // returning student gave us the first time round. Leaving the column out
      // of the update means "don't touch it", which is what is meant.
      systemId,
      year,
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
