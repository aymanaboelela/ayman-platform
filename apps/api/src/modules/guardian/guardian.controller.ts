import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { Request, Response } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { clientIpFromRequest } from '../../common/throttle/request-identity';
import { GuardianSignInDto } from './guardian.dto';
import { GuardianSessionService } from './guardian-session.service';
import { GUARDIAN_COOKIE, guardianCookieOptions } from './guardian-cookie';

/**
 * بوابة ولي الأمر — الدخول والخروج.
 *
 * `@Public()` لأن اللي بيدخل هنا **مالوش حساب** أصلًا، فالحارس العادي
 * مالوش معنى عليه. والكود هو اللي بيثبت إنه مصرّح له، وهو بيتفحص في
 * الخدمة مع الحد على المحاولات.
 *
 * و`@RequireCsrf()` فوقه: دول راوتس **عامة بتكتب كوكي**، وهي الحالة
 * الوحيدة في المنتج اللي محتاجة الاتنين مع بعض — نفس اللي راوتس المساعد
 * ماشية عليه. من غيره، فورم على موقع تاني كان يقدر يسجّل دخول متصفحك على
 * حساب طالب مش بتاعك من غير ما تعرف.
 */
@Controller('guardian')
@UsePipes(ZodValidationPipe)
export class GuardianController {
  constructor(private readonly sessions: GuardianSessionService) {}

  /**
   * الكود → كوكي.
   *
   * ⚠️ الكود **في الجسم مش في المسار**: مسار فيه الكود بيتكتب في لوج كل
   * بروكسي في الطريق، وفي تاريخ المتصفح، وفي الـ`Referer` لأي صورة على
   * الصفحة اللي بعدها. والكود ده مفتاح.
   *
   * و`401` واحدة لكل الأسباب — اقرا `signIn` نفسها. الاستثناء `429` لما
   * العنوان يتقفل، و`details.retryAfterSeconds` (الفلتر بيعدّي السكالرز تحت `details`) عشان الفورم يقول «استنى كام».
   */
  @Public()
  @RequireCsrf()
  @Post('sign-in')
  async signIn(
    @Body() body: GuardianSignInDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    /*
     * ⚠️ `clientIpFromRequest` مش `request.ip`.
     *
     * `trust proxy` مضبوط على هوب واحد، والبرودكشن فيه اتنين (Cloudflare ثم
     * Traefik) — فـ`request.ip` كان **عنوان الـedge بتاع Cloudflare**، واحد
     * لكل الآباء اللي بيعدّوا من نفس الـPoP. يعني خمس أكواد غلط من أي حد في
     * مصر كانت بتقفل البوابة على الكل، والقفل بيكبر لحد ساعة. الـ
     * `cf-connecting-ip` هو العميل الحقيقي — اقرا الدالة نفسها.
     */
    const result = await this.sessions.signIn(body.code, clientIpFromRequest(request));
    if (!result.ok) {
      if (result.retryAfterSeconds) {
        response.setHeader('Retry-After', String(result.retryAfterSeconds));
        throw new HttpException(
          {
            code: 'guardian_locked',
            message: 'guardian sign-in locked',
            retryAfterSeconds: result.retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException('guardian code not accepted');
    }

    response.cookie(GUARDIAN_COOKIE, result.token, guardianCookieOptions());
    return { ok: true };
  }

  /** الخروج. بيمسح الكوكي وبس — مفيش حالة على السيرفر تتمسح. */
  @Public()
  @RequireCsrf()
  @Post('sign-out')
  signOut(@Res({ passthrough: true }) response: Response): { ok: true } {
    response.clearCookie(GUARDIAN_COOKIE, { ...guardianCookieOptions(), maxAge: undefined });
    return { ok: true };
  }
}
