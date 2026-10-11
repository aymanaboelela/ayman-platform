import { Controller, Get } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from './decorators/current-user.decorator';
import { type Permission, permissionsForUser } from './permissions';
import { PrismaService } from '../prisma/prisma.service';

export interface SessionResponse {
  id: string;
  /**
   * `null` when the student never gave one.
   *
   * Straight from the column, which is genuinely nullable — there are no
   * synthesised placeholders to filter out any more (see the note on
   * `User.email` in `schema.prisma`).
   *
   * The FIELD being nullable is what forces every consumer — the account menu,
   * the admin header, the onboarding identity header, the profile page — to
   * have an answer for "there is no email", rather than each of them
   * discovering it at runtime.
   */
  email: string | null;
  /** The account's real identity, and what the UI shows where the email used to be. */
  phoneNumber: string | null;
  /**
   * Both come straight from the identity provider on a social sign-up (Better
   * Auth writes them to `User` from Google's `userinfo`), and from the
   * registration form on an email/password one. Exposed so a signed-in
   * surface can greet the student by name and show their avatar without a
   * second round trip — `/onboarding` prefills its own name field from this
   * rather than making someone retype what Google already told us.
   *
   * `image` is nullable for a reason: an email/password account never has
   * one, and Google accounts without a profile photo don't either. Every
   * consumer needs a fallback.
   */
  name: string;
  image: string | null;
  role: string;
  permissions: readonly Permission[];
  /**
   * «محتاج يكمّل بياناته ولا لأ» — عشان `proxy.ts` يقرّر يوجّهه لـ`/onboarding`
   * ولا لأ، من غير ما يحتاج `profile:read`. انظر الكومنت على `me()`.
   */
  onboardingCompleted: boolean;
}

/**
 * No `@Public()` here — deliberately left undecorated. Two reasons: it's the
 * minimal "am I logged in" echo every frontend needs, and it doubles as a
 * live, not just unit-tested, proof that `AuthGuard`'s deny-by-default holds
 * for an ordinary production route with zero decorators.
 *
 * `permissions` exists so the web app can decide what to RENDER without ever
 * writing `role === 'admin'`. It is not an authorization decision: the guard
 * re-checks on every request, and a client that lies about its own permission
 * list simply gets a 403 from the API it then calls.
 */
@Controller('session')
export class SessionController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ⚠️ `onboardingCompleted` اتضافت هنا، بدل ما `proxy.ts` يفضل يسأل
   * `GET /api/profile/me`، لأن الراوت ده **مقفول بـ`profile:read`** — صلاحية
   * طالب، مالهاش أي علاقة بـ«إنت داخل ولا لأ».
   *
   * لحد ما اتصلحت: مساعد اتدّيله صلاحيات محدودة من `/admin/roles` (شاشة
   * `MemberPermissions`) من غير ما حد يحط «الملف الشخصي» معاها — ومفيش سبب
   * يحطها، هي مش من حاجته — كان بيعدّي تسجيل الدخول فعلًا (الجلسة صحيحة،
   * `/api/session` نفسها كانت بترجّعها تمام) بس `resolveAuthState` في
   * `proxy.ts` كان بيسأل `/api/profile/me`، والراوت ده بيرفض (403) لأي
   * حساب مالوش `profile:read`، و`resolveAuthState` بيقرا أي رد مش 200 على
   * إنه «مش داخل خالص» (fail-closed) — فالحساب بيترمي `/login` في حلقة.
   * ظاهره «الصلاحية مش شغالة»، وحقيقته «مش قادر يوصل للوحة أصلًا».
   *
   * الحل: `/api/session` ده أصلًا مالهوش صلاحية مطلوبة (أعلى الملف)، فهو
   * المكان الصح يرجّع «إنت داخل، ودورك إيه، وخلّصت onboarding ولا لأ» مرة
   * واحدة. الـonboarding نفسه مفهوم طالب بس — مدرّس أو مساعد عمرهم ما
   * بيعدّوا بيه، فـ`true` ثابتة ليهم، ومفيش استعلام زيادة في الداتابيز.
   */
  @Get()
  async me(@CurrentUser() user: AuthenticatedUser): Promise<SessionResponse> {
    const onboardingCompleted =
      user.role === 'student'
        ? (await this.prisma.studentProfile.findUnique({
            where: { userId: user.id },
            select: { onboardingCompletedAt: true },
          }))?.onboardingCompletedAt != null
        : true;

    return {
      id: user.id,
      email: user.email ?? null,
      phoneNumber: user.phoneNumber ?? null,
      name: user.name,
      image: user.image ?? null,
      role: user.role,
      /* بتاعة الحساب، مش بتاعة الرول: الشاشة لازم تخبّي اللي الـAPI هيرفضه،
         وإلا المساعد بيدوس زرار ويتقال له «مش من حقك». */
      permissions: permissionsForUser(user.id, user.role),
      onboardingCompleted,
    };
  }
}
