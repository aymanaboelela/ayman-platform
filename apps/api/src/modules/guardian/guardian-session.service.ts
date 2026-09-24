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
 *
 * ## قفل بيكبر
 *
 * كل `FAILS_PER_LOCK` غلطات → قفل، وكل قفل أطول من اللي قبله: دقيقة، خمسة،
 * ربع ساعة، ساعة. الأب اللي غلط في حرف بيستنى دقيقة؛ والسكريبت اللي بيجرّب
 * أكواد متسرّبة بيوصل لساعة بعد ٢٠ محاولة، وبيفضل عندها.
 *
 * والغلطات بس هي اللي بتتعدّ — الدخول الصح مش بيقرّب حد من القفل. كانت
 * كل محاولة بتتعدّ، فأب بيفتح كل يوم من نفس الشبكة كان بيستهلك الحد.
 */
const FAILS_PER_LOCK = 5;
/** الغلطات الأقدم من كده ماتتعدّش — خمسة غلط في أسبوع مش هجوم. */
const FAIL_WINDOW_SECONDS = 15 * 60;
/** مدة كل قفل بالترتيب. بعد آخر واحدة بيفضل عليها. */
const LOCK_LADDER_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60];
/**
 * أد إيه العنوان بيفتكر إنه اتقفل قبل كده. يوم: اللي اتقفل الصبح ورجع
 * بالليل بيكمّل من مكانه في السلّم، مش من الدقيقة الأولى.
 */
const LOCK_MEMORY_SECONDS = 24 * 60 * 60;

/** نتيجة `signIn`. */
export type GuardianSignInResult =
  | { ok: true; token: string }
  | { ok: false; retryAfterSeconds?: number };

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
   * المحظور بيرجعوا نفس الحاجة. رسايل مختلفة كانت هتخلّي اللي بيحاول يعرف
   * إن الكود ده صح بس الحساب متقفل، وده معلومة عن حساب مش بتاعه.
   *
   * القفل هو الاستثناء الوحيد اللي بيتقال (`retryAfterSeconds`)، وده آمن
   * لأنه على **العنوان**: بيقول «إنت غلطت كتير»، مش حاجة عن أي كود.
   *
   * ⚠️ والقفل بيتفحص **قبل** الكود: كود صح وقت القفل بيترفض برضه. لو كان
   * بيعدّي، القفل كان هيبقى عدّاد بس — السكريبت يكمّل تجريب ويعرف إنه
   * لقى واحد صح من الرد.
   */
  async signIn(code: string, ip: string): Promise<GuardianSignInResult> {
    const lockedFor = await this.lockedFor(ip);
    if (lockedFor > 0) return { ok: false, retryAfterSeconds: lockedFor };

    const profile = await this.prisma.studentProfile.findUnique({
      where: { guardianCode: code.trim().toUpperCase() },
      select: { userId: true, user: { select: { bannedAt: true } } },
    });

    if (!profile || profile.user.bannedAt !== null) {
      const retryAfterSeconds = await this.recordFailure(ip);
      return retryAfterSeconds ? { ok: false, retryAfterSeconds } : { ok: false };
    }

    const token = await new SignJWT({ sub: profile.userId, kind: 'guardian' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_DAYS}d`)
      .sign(this.secret);
    return { ok: true, token };
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
   * الثواني الباقية على قفل العنوان ده، أو صفر.
   *
   * ولو ريديس وقع، الدخول **بيعدّي**: الكود نفسه ١٣٠ بت، وقفل البوابة على
   * كل الآباء عشان عدّاد مش شغّال بيكلّف أكتر مما بيحمي.
   */
  private async lockedFor(ip: string): Promise<number> {
    try {
      const ms = await this.redis.pttl(`guardian:lock:${ip}`);
      return ms > 0 ? Math.ceil(ms / 1000) : 0;
    } catch (error) {
      this.logger.warn({ err: error }, 'guardian attempt counter unavailable — allowing');
      return 0;
    }
  }

  /**
   * بيعدّ غلطة، ولو دي الخامسة بيقفل العنوان ويرجّع مدة القفل بالثواني.
   *
   * العدّاد بيتمسح مع كل قفل، فالخمسة اللي بعده بتبدأ من الصفر — واللي بيكبر
   * هو `level`، مش العدّاد.
   */
  private async recordFailure(ip: string): Promise<number | null> {
    const failKey = `guardian:fail:${ip}`;
    const levelKey = `guardian:level:${ip}`;
    try {
      const fails = await this.redis.incr(failKey);
      if (fails === 1) await this.redis.expire(failKey, FAIL_WINDOW_SECONDS);
      if (fails < FAILS_PER_LOCK) return null;

      const level = await this.redis.incr(levelKey);
      await this.redis.expire(levelKey, LOCK_MEMORY_SECONDS);
      const seconds = LOCK_LADDER_SECONDS[Math.min(level, LOCK_LADDER_SECONDS.length) - 1]!;
      await this.redis.set(`guardian:lock:${ip}`, '1', 'EX', seconds);
      await this.redis.del(failKey);
      this.logger.warn({ ip, level, seconds }, 'guardian sign-in locked for address');
      return seconds;
    } catch (error) {
      this.logger.warn({ err: error }, 'guardian attempt counter unavailable — allowing');
      return null;
    }
  }
}
