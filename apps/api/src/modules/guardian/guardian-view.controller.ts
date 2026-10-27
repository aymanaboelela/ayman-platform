import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { GuardianView } from '@ayman/contracts/guardian-view';
import { Public } from '../../auth/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { GuardianSessionService, codeFingerprint } from './guardian-session.service';
import { GuardianReportService } from './guardian-report.service';
import { readCookie } from '../assistant/guest-token';
import { GUARDIAN_COOKIE } from './guardian-cookie';

/**
 * اللي ولي الأمر بيشوفه.
 *
 * ## ليه كل رقم بيتقرا من شاشة الطالب نفسها
 *
 * لأن ده بالظبط السؤال: «وصل لفين». تجميع تاني بنفس المعنى كان هيبقى مصدر
 * تاني للحقيقة — والأب يشوف رقم والطالب يشوف رقم تاني على نفس الشاشتين،
 * والاتنين مقتنعين. `GuardianReportService` بيقول كل بلوك جاي منين.
 *
 * ## والقراية بس
 *
 * مفيش راوت كتابة في الملف ده ولا في اللي جنبه. جلسة ولي الأمر بتقول «أنهي
 * طالب» وخلاص، ومفيش حاجة في المنصة بتقبلها غير القرايات دي.
 */
@Controller('guardian')
export class GuardianViewController {
  constructor(
    private readonly sessions: GuardianSessionService,
    private readonly report: GuardianReportService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * `@Public()` لأن الحارس العادي بيدوّر على جلسة طالب — والأب مالوش
   * واحدة. الكوكي هي الهوية، وبتتحقق هنا بالتوقيع في كل طلب.
   *
   * ⚠️ الـ`userId` بيتقرا من **التوكن الموقّع**، مش من أي بارامتر. مفيش
   * مسار يقدر يخلّي الأب يبص على طالب تاني — الطالب مكتوب في الجلسة نفسها.
   */
  @Public()
  @Get('me')
  async me(@Req() request: Request): Promise<GuardianView> {
    // `request.headers.cookie` مش `request.cookies`: مفيش `cookie-parser`
    // على التطبيق ده، فـ`request.cookies` بتبقى `undefined` — وقراية منها
    // كانت هتدّي «مفيش توكن» دايمًا، يعني بوابة مقفولة على طول من غير أي
    // رسالة خطأ. نفس `readCookie` اللي المساعد ماشي عليه.
    const token = readCookie(request.headers.cookie, GUARDIAN_COOKIE);
    const session = token ? await this.sessions.verify(token) : null;
    if (!session) throw new UnauthorizedException();

    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: session.studentUserId },
      // ⚠️ `select` محدد مش الصف كامل: الصف فيه `guardianCode` نفسه، وبعته
      // هنا كان هيخلّي أي حد فتح الجلسة مرة يقدر يعيد فتحها للأبد حتى بعد
      // ما الطالب يغيّر كوده.
      //
      // `guardianCode` IS read now — to compare, never to send. See below.
      select: {
        fullName: true,
        year: true,
        systemId: true,
        track: { select: { labelAr: true } },
        guardianCode: true,
        user: { select: { bannedAt: true } },
      },
    });
    if (!profile) throw new UnauthorizedException();

    /*
     * The token proves it WAS valid, not that it still is. Re-checked against
     * the row on every read, the same two things `signIn` refuses on:
     *   - the code it was opened with is no longer the student's code (it was
     *     replaced because it leaked), and
     *   - the student is banned — `ban` deletes the student's own sessions, and
     *     this one used to survive it for up to fourteen days.
     * A token from before the fingerprint existed carries none; it is let
     * through on the ban check alone and expires on its own.
     */
    if (profile.user.bannedAt !== null) throw new UnauthorizedException();
    if (
      session.codeFingerprint !== null &&
      session.codeFingerprint !== codeFingerprint(profile.guardianCode)
    ) {
      throw new UnauthorizedException();
    }

    /*
     * The ONLY id that reaches the report is the one the signed token carries,
     * re-checked against the row just above. Every block of the page — marks,
     * homework, rank, centre — is keyed on it inside the report; nothing on
     * this route takes an id from the request.
     */
    return this.report.forStudent({
      userId: session.studentUserId,
      fullName: profile.fullName,
      year: profile.year,
      systemId: profile.systemId,
      trackLabel: profile.track?.labelAr ?? null,
    });
  }
}
