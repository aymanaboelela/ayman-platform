import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { Dashboard } from '@ayman/contracts';
import { Public } from '../../auth/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { GuardianSessionService } from './guardian-session.service';
import { GuardianReportService, type GuardianReport } from './guardian-report.service';
import { readCookie } from '../assistant/guest-token';
import { GUARDIAN_COOKIE } from './guardian-cookie';

export interface GuardianView {
  student: { name: string; year: number | null };
  dashboard: Dashboard;
  report: GuardianReport;
}

/**
 * اللي ولي الأمر بيشوفه.
 *
 * ## ليه بيعيد استخدام `DashboardService.forUser`
 *
 * لأن ده بالظبط السؤال: «ابني وصل لفين». تجميع تاني بنفس المعنى كان هيبقى
 * مصدر تاني للحقيقة — والأب يشوف رقم والابن يشوف رقم تاني على نفس الشاشتين،
 * والاتنين مقتنعين. نفس الحساب، نفس الأرقام.
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
    private readonly dashboard: DashboardService,
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
      select: { fullName: true, year: true },
    });
    if (!profile) throw new UnauthorizedException();

    return {
      student: { name: profile.fullName, year: profile.year },
      // بالتوازي: الاتنين قرايات مستقلة، وتسلسلهم كان بيضاعف انتظار
      // الصفحة الوحيدة اللي الأب بيفتحها.
      ...(await this.both(session.studentUserId)),
    };
  }

  /** القرايتين مع بعض — اقرا مكان النداء. */
  private async both(userId: string): Promise<{ dashboard: Dashboard; report: GuardianReport }> {
    const [dashboard, report] = await Promise.all([
      this.dashboard.forUser(userId),
      this.report.forStudent(userId),
    ]);
    return { dashboard, report };
  }
}
