import type { CookieOptions } from 'express';
import { loadEnv } from '../../config/env';

/**
 * كوكي بوابة ولي الأمر.
 *
 * `__Host-` في الإنتاج وبإسم عاري في التطوير — نفس القاعدة بالحرف اللي
 * كوكي الجلسة ماشي عليها (`auth.config.ts`)، ولنفس السبب: `__Host-` بيلزم
 * `Secure`، و`Secure` مابيشتغلش على `http://localhost`.
 *
 * ⚠️ **اسم مختلف عن كوكي الطالب عن قصد.** لو الاتنين بنفس الاسم، جهاز فيه
 * الأب والابن بيسجّلوا دخول على نفس المتصفح كان آخر واحد بيكتب هو اللي
 * يفضل — والتاني يتطرد من غير ما يفهم ليه. بالاسمين، الاتنين بيقعدوا مع
 * بعض، وكل واحد على صفحته.
 */
export const GUARDIAN_COOKIE_PROD = '__Host-guardian_token';
export const GUARDIAN_COOKIE_DEV = 'guardian_token';

export const GUARDIAN_COOKIE =
  loadEnv(process.env).NODE_ENV === 'production' ? GUARDIAN_COOKIE_PROD : GUARDIAN_COOKIE_DEV;

/**
 * `httpOnly` — الجافاسكريبت مايقراش التوكن. الشاشة مامحتاجاهوش، والـXSS
 * لو حصلت يوم مالهاش تاخد الجلسة معاها.
 *
 * `sameSite: 'lax'` — نفس اختيار كوكي الجلسة. البوابة دي مفيهاش أي كتابة،
 * فأسوأ حاجة ممكن موقع تاني يعملها إنه يخلّي الأب يفتح صفحة ابنه هو.
 *
 * `path: '/'` — لازم، `__Host-` بيرفض أي حاجة غيرها.
 */
export function guardianCookieOptions(): CookieOptions {
  const isProduction = loadEnv(process.env).NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 14 * 24 * 60 * 60 * 1000,
  };
}
