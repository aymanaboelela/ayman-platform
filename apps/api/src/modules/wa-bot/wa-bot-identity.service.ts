import { Injectable } from '@nestjs/common';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import type { ChatWho } from '@ayman/contracts/wa-bot/schemas';
import { PrismaService } from '../../prisma/prisma.service';

/** Who a WhatsApp number belongs to, as far as the platform can tell. */
export interface Identity {
  readonly who: ChatWho;
  /** The student — for a parent, their child. */
  readonly userId: string | null;
  readonly name: string | null;
  /** From the student's onboarding, when they gave one. */
  readonly system: string | null;
  readonly year: number | null;
  /** A staff account wrote — never a lead, and never a «اشتراكك» line. */
  readonly staff: boolean;
}

export const UNKNOWN: Identity = { who: 'lead', userId: null, name: null, system: null, year: null, staff: false };

/**
 * The phone number as the bot keys it: E.164 for an Egyptian number, and
 * `+<digits>` for anything else (a parent in the Gulf is still somebody to
 * answer). `null` for a string that is not a phone number at all.
 */
export function chatPhone(raw: string): string | null {
  const eg = normalizeEgyptianPhone(raw);
  if (eg) return eg;
  const digits = raw.replace(/\D/gu, '');
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

/**
 * Every spelling an Egyptian number is stored under somewhere in this schema.
 *
 * `users.phone_number` is E.164 (the sign-up hook normalises it), but
 * `student_profiles.father_phone`/`mother_phone` are whatever a fifteen-year-
 * old typed during onboarding — «01012345678», «201012345678», «+20 10…». The
 * columns are `citext`, so equality is cheap; this lists the forms people
 * actually type rather than normalising every row in SQL.
 */
export function phoneSpellings(e164: string): string[] {
  const out = new Set<string>([e164]);
  if (e164.startsWith('+20')) {
    const national = e164.slice(3);
    out.add(`20${national}`);
    out.add(`0${national}`);
    out.add(national);
    out.add(`0020${national}`);
  } else {
    out.add(e164.slice(1));
  }
  return [...out];
}

@Injectable()
export class WaBotIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async identify(phone: string): Promise<Identity> {
    const spellings = phoneSpellings(phone);

    const user = await this.prisma.user.findFirst({
      where: { phoneNumber: { in: spellings } },
      select: {
        id: true,
        name: true,
        role: true,
        studentProfile: { select: { fullName: true, year: true, system: { select: { slug: true } } } },
      },
    });
    if (user) {
      if (user.role !== 'student') return { ...UNKNOWN, staff: true, userId: user.id, name: user.name };
      return {
        who: 'student',
        userId: user.id,
        name: user.studentProfile?.fullName ?? user.name,
        system: user.studentProfile?.system?.slug ?? null,
        year: user.studentProfile?.year ?? null,
        staff: false,
      };
    }

    const profile = await this.prisma.studentProfile.findFirst({
      where: { phone: { in: spellings } },
      select: { userId: true, fullName: true, year: true, system: { select: { slug: true } } },
    });
    if (profile) {
      return {
        who: 'student',
        userId: profile.userId,
        name: profile.fullName,
        system: profile.system?.slug ?? null,
        year: profile.year,
        staff: false,
      };
    }

    // A parent's number can sit on several children; the most recently
    // onboarded one is the likeliest to be the one being asked about.
    const child = await this.prisma.studentProfile.findFirst({
      where: { OR: [{ fatherPhone: { in: spellings } }, { motherPhone: { in: spellings } }] },
      orderBy: [{ onboardingCompletedAt: { sort: 'desc', nulls: 'last' } }, { userId: 'asc' }],
      select: { userId: true, fullName: true, year: true, system: { select: { slug: true } } },
    });
    if (child) {
      return {
        who: 'parent',
        userId: child.userId,
        name: child.fullName,
        system: child.system?.slug ?? null,
        year: child.year,
        staff: false,
      };
    }

    return UNKNOWN;
  }

  /**
   * «اشترك»: whether this account has PAID for something — an approved,
   * non-free payment. A sign-up alone is not a conversion; a comped grant is
   * not a sale.
   */
  async hasPaid(userId: string): Promise<boolean> {
    const paid = await this.prisma.paymentSubmission.findFirst({
      where: { userId, status: 'approved', isFree: false },
      select: { id: true },
    });
    return paid !== null;
  }
}
