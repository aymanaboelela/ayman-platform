import { Injectable } from '@nestjs/common';
import type { Audience } from '@ayman/contracts/marketing/campaign';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Who a campaign is for, resolved ONCE into a list of numbers.
 *
 * ## The three sources, and why they are not one query
 *
 * A student's own number lives on `users.phone_number`, already E.164 and
 * already unique. A parent's lives on `student_profiles.father_phone` /
 * `mother_phone`, is `citext`, was typed by a fifteen-year-old during
 * onboarding and may be anything at all. A pasted number came off a
 * spreadsheet. They need different normalisation and they carry different
 * amounts of identity, so they are gathered separately and merged by phone.
 *
 * ## Merge order is the design
 *
 * Students win. A number that is both a student's and a parent's contact
 * belongs to the student — that is the row that has a name for `{{الاسم}}`
 * and a `user_id` for the audit trail. Losing that to a parent row would send
 * an unaddressed message to somebody the platform can identify perfectly
 * well.
 *
 * ## Opt-outs are applied here AND at send time
 *
 * Here so the count on the confirm dialog is honest, and again in the runner
 * because a campaign takes days and «قف» arrives in the middle of one. Only
 * the second one is load-bearing; this one is the one that stops the screen
 * from lying.
 */

export interface ResolvedRecipient {
  phone: string;
  name: string | null;
  userId: string | null;
}

export interface ResolvedAudience {
  recipients: ResolvedRecipient[];
  /** Rows dropped because no valid Egyptian number could be read off them. */
  unreachable: number;
  /** Distinct numbers dropped because they had opted out. */
  optedOut: number;
}

@Injectable()
export class AudienceService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(audience: Audience): Promise<ResolvedAudience> {
    const byPhone = new Map<string, ResolvedRecipient>();
    let unreachable = 0;

    // A single scan serves both `students` and `parents`: the filters are the
    // same and the second source is columns on the same rows. Two queries
    // would double the work and could disagree with each other after a
    // concurrent profile edit.
    const needsStudents = audience.students || audience.parents;
    const students = needsStudents ? await this.students(audience) : [];

    if (audience.students) {
      for (const student of students) {
        const phone = normalizeEgyptianPhone(student.phone ?? '');
        if (!phone) {
          unreachable += 1;
          continue;
        }
        if (!byPhone.has(phone)) byPhone.set(phone, { phone, name: student.name, userId: student.id });
      }
    }

    if (audience.parents) {
      for (const student of students) {
        for (const raw of [student.fatherPhone, student.motherPhone]) {
          if (!raw) continue;
          const phone = normalizeEgyptianPhone(raw);
          if (!phone) {
            unreachable += 1;
            continue;
          }
          // No name and no userId: this is a parent, and addressing them by
          // their child's first name would be worse than not addressing them.
          if (!byPhone.has(phone)) byPhone.set(phone, { phone, name: null, userId: null });
        }
      }
    }

    for (const raw of audience.extraPhones) {
      const phone = normalizeEgyptianPhone(raw);
      if (!phone) {
        unreachable += 1;
        continue;
      }
      if (!byPhone.has(phone)) byPhone.set(phone, { phone, name: null, userId: null });
    }

    const optedOutRows = await this.prisma.marketingOptOut.findMany({
      where: { phone: { in: [...byPhone.keys()] } },
      select: { phone: true },
    });
    for (const row of optedOutRows) byPhone.delete(row.phone);

    return {
      recipients: [...byPhone.values()],
      unreachable,
      optedOut: optedOutRows.length,
    };
  }

  /**
   * Every student the filters admit, with the three phone columns.
   *
   * `bannedAt: null` — the same definition of "a student" `BroadcastService`
   * uses, and for the same reason: two screens that disagree about who «كل
   * الطلبة» means is a bug that only ever shows up as a wrong number on a
   * confirm dialog.
   */
  private students(audience: Audience) {
    const yearFilter = audience.years.length > 0 ? { year: { in: audience.years } } : {};

    return this.prisma.user.findMany({
      where: {
        role: 'student',
        bannedAt: null,
        ...(audience.years.length > 0 ? { studentProfile: yearFilter } : {}),
        ...(audience.courseIds.length > 0
          ? { enrollments: { some: { courseId: { in: audience.courseIds } } } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        studentProfile: { select: { fullName: true, fatherPhone: true, motherPhone: true } },
      },
      // Deterministic, so re-resolving the same audience twice produces the
      // same order and therefore the same `position` sequence.
      orderBy: { id: 'asc' },
    }).then((rows) =>
      rows.map((row) => ({
        id: row.id,
        // The profile's full name is the one onboarding collected; `user.name`
        // can be whatever an OAuth provider supplied.
        name: row.studentProfile?.fullName ?? row.name,
        phone: row.phoneNumber,
        fatherPhone: row.studentProfile?.fatherPhone ?? null,
        motherPhone: row.studentProfile?.motherPhone ?? null,
      })),
    );
  }
}
