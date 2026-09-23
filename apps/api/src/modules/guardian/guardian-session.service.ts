import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { SignJWT, jwtVerify } from 'jose';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { loadEnv } from '../../config/env';

/** أد إيه الجلسة تفضل. أسبوعين — الأب بيبص كل كام يوم، مش كل ساعة. */
const SESSION_DAYS = 14;

/** توكن الحقن للسر — اقرا الكونستركتور. */
export const GUARDIAN_SECRET = Symbol('GUARDIAN_SECRET');

/**
 * ⚠️ الحد على المحاولات — وهو الحماية الحقيقية هنا.
 *
 * الكود ١٣٠ بت، يعني التخمين مستحيل رياضيًا. الحد مش موجود عشان التخمين —
 * هو موجود عشان **الحاجة اللي بتحصل فعلًا**: كود اتسرّب أو اتنشر في جروب،
 * وبقى فيه محاولات كتير من عناوين كتير على نفس الحساب. ومن غير عدّاد محدش
 * كان هيعرف إن ده بيحصل أصلًا.
 *
 * العدّ بالـIP مش بالكود: العدّ بالكود بيدّي أي حد طريقة يقفل بوابة أي
 * طالب — يكتب كود غلط عشرين مرة والأب الحقيقي يتقفل عليه. ده **حرمان
 * خدمة** مجاني، والعدّ بالعنوان بيخلّي التكلفة على اللي بيحاول.
 */
const MAX_ATTEMPTS = 20;
const ATTEMPT_WINDOW_SECONDS = 15 * 60;

export interface GuardianSession {
  /** الطالب اللي الجلسة دي بتشوفه. مفيش غيره. */
  studentUserId: string;
}

/**
 * بوابة ولي الأمر — دخول بكود، من غير حساب.
 *
 * ## ليه توكن موقّع مش حساب
 *
 * ولي الأمر مش مستخدم على المنصة: مالوش بروفايل، ولا كورسات، ولا بيكتب أي
 * حاجة. عمل صف `User` ليه كان هيحطّه في كل استعلام بيعدّ الطلبة، وفي كل
 * شاشة بتقول «كام واحد مسجّل»، وفي `role` لازم حد يقرر معناه.
 *
 * التوكن بيحمل حاجة واحدة — **أنهي طالب** — وبيتقرا للقراية بس. مفيش راوت
 * بيكتب حاجة بيقبله، ومفيش ترقية منه لحساب.
 *
 * ## والكود نفسه مش في التوكن
 *
 * التوكن بيحمل `studentUserId`، مش الكود. فحتى لو التوكن اتسرّب من جهاز
 * الأب، اللي أخده مايقدرش يستخرج منه الكود ولا يعمل بيه جلسة جديدة بعد ما
 * الطالب يغيّره.
 */
@Injectable()
export class GuardianSessionService {
  private readonly logger = new Logger(GuardianSessionService.name);
  private readonly secret: Uint8Array;

  /**
   * `secret` بيتحقن مش بيتقرا من `process.env` جوّه.
   *
   * الخدمة دي بتتبنى بالإيد في التستات، وقراية البيئة كلها في الكونستركتور
   * كانت بتلزم كل تست يزوّد ٢٠ متغيّر مالهمش أي علاقة بالتوقيع. والحقن
   * بيخلّي الاعتماد الحقيقي (سر واحد) مكتوب في التوقيع.
   */
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Optional() @Inject(GUARDIAN_SECRET) secret?: string,
  ) {
    this.secret = new TextEncoder().encode(
      secret ?? loadEnv(process.env).BETTER_AUTH_SECRET,
    );
  }

  /**
   * الكود → توكن، أو `null`.
   *
   * ⚠️ **سبب واحد للرفض، مهما كان الغلط.** الكود اللي مش موجود والحساب
   * المحظور والمحاولات اللي خلصت — كلهم بيرجعوا `null`. رسايل مختلفة كانت
   * هتخلّي اللي بيحاول يعرف إن الكود ده صح بس الحساب متقفل، وده معلومة
   * عن حساب مش بتاعه.
   */
  async signIn(code: string, ip: string): Promise<string | null> {
    if (!(await this.underLimit(ip))) return null;

    const profile = await this.prisma.studentProfile.findUnique({
      where: { guardianCode: code.trim().toUpperCase() },
      select: { userId: true, user: { select: { bannedAt: true } } },
    });

    if (!profile || profile.user.bannedAt !== null) return null;

    return new SignJWT({ sub: profile.userId, kind: 'guardian' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_DAYS}d`)
      .sign(this.secret);
  }

  /** التوكن → الطالب، أو `null` لو منتهي أو متلاعب فيه أو مش بتاع البوابة دي. */
  async verify(token: string): Promise<GuardianSession | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      // `kind` بيمنع توكن من أي جهة تانية في المنصة إنه يعدّي هنا — نفس
      // السر بيوقّع حاجات تانية، والتوقيع لوحده مش هوية.
      if (payload.kind !== 'guardian' || typeof payload.sub !== 'string') return null;
      return { studentUserId: payload.sub };
    } catch {
      return null;
    }
  }

  /**
   * عدّاد المحاولات بالعنوان. `INCR` + `EXPIRE` على أول واحدة — نافذة
   * منزلقة تقريبية، وهي كفاية: الغرض إن محاولات كتير من مكان واحد تبقى
   * غالية، مش قياس دقيق.
   *
   * ولو ريديس وقع، الدخول **بيعدّي**: الكود نفسه ١٣٠ بت، وقفل البوابة على
   * كل الآباء عشان عدّاد مش شغّال بيكلّف أكتر مما بيحمي.
   */
  private async underLimit(ip: string): Promise<boolean> {
    const key = `guardian:attempt:${ip}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, ATTEMPT_WINDOW_SECONDS);
      return count <= MAX_ATTEMPTS;
    } catch (error) {
      this.logger.warn({ err: error }, 'guardian attempt counter unavailable — allowing');
      return true;
    }
  }
}
