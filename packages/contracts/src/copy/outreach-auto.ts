/**
 * The sentences behind the two AUTOMATIC WhatsApp kinds — «كمّل الدفع» after
 * an abandoned checkout, and «الحساب جاهز» to an account that never bought
 * anything.
 *
 * A module of its own rather than more exports on `copy/outreach.ts`, for the
 * Turbopack reason in `docs/agents/pitfalls.md`: module ids are path-derived,
 * so a new export on a module the browser already holds can break a tab left
 * open across the deploy. Same voice, same rules — read the header of
 * `copy/outreach.ts` before editing a line here. In short:
 *
 *   · spoken Egyptian, short sentences, nothing to parse;
 *   · NOTHING inflects for the reader. No imperatives («كمّل»، «ادفع»), no
 *     second-person verbs («كنت»، «مكمّلتش» read differently to a girl), no
 *     «معاك/ليك/بيك». First person, the inclusive plural, nominal sentences,
 *     and ـك on a noun only. `compose.spec.ts` runs its tripwire over these
 *     pools and over composed bodies;
 *   · no name. The sender, if a line ever needs one, is `{instructor}`.
 *
 * ## Why these lines say «اللينك» and not «الزرار اللي فوق»
 *
 * Unlike every other kind, these two are read on WhatsApp first and in the
 * platform's own chat second. The in-app bubble draws a card from a URL line;
 * WhatsApp draws a link preview from the same line. «اللينك اللي فوق» is true
 * in both places, «الزرار» is true in one.
 *
 * ## Placeholders
 *
 *   {title}   the course title (checkout on a course only)
 *   {course}  the course that fits the student's year (signup nudge only)
 */

/** A course checkout that stopped at the payment step. Names the course. */
export const CHECKOUT_COURSE_OPENERS = [
  'الاشتراك في «{title}» لسه واقف عند خطوة الدفع.',
  'لقيت طلب الاشتراك في «{title}» مستني خطوة الدفع بس.',
  'خطوة الدفع في «{title}» لسه مفتوحة ومستنية.',
  'الحجز في «{title}» فاضله خطوة واحدة: الدفع.',
] as const;

/** A book order that has an address and no payment. */
export const CHECKOUT_BOOK_OPENERS = [
  'طلب الكتاب متسجّل والعنوان عندنا، وناقص خطوة الدفع بس.',
  'طلب الكتاب لسه مستني الدفع عشان نبدأ نجهّزه.',
  'الكتاب محجوز على العنوان اللي اتكتب، وفاضل الدفع.',
] as const;

/** Said right above the deep link. Promises only what the link does. */
export const CHECKOUT_BODIES = [
  'اللينك ده بيفتح نفس الخطوة على طول، من غير ما نبدأ من الأول:',
  'من اللينك ده الخطوة بتفتح زي ما كانت بالظبط:',
  'دوسة واحدة على اللينك ده والخطوة ترجع زي ما هي:',
  'نفس صفحة الدفع موجودة على اللينك ده:',
] as const;

export const CHECKOUT_CLOSERS = [
  'ولو فيه أي مشكلة في الدفع أو سؤال، الرد هنا وأنا أساعد.',
  'لو حاجة وقفت في التحويل، رسالة هنا وأنا أحلّها.',
  'أي استفسار عن طريقة الدفع، أنا موجود هنا.',
  'لو الدفع محتاج مساعدة، كلمة واحدة هنا كفاية.',
] as const;

/** First nudge — the day after the account was made. */
export const SIGNUP_OPENERS = [
  'مبسوط إن الحساب على المنصة اتعمل.',
  'الحساب على المنصة جاهز، وفاضل أهم خطوة: الكورس.',
  'أهلاً وسهلاً في المنصة 👋 الحساب جاهز من امبارح.',
  'الحساب اتعمل، والجزء الصعب خلص.',
] as const;

/** Second nudge — days later, still nothing bought. Warmer, never pushier. */
export const SIGNUP_SECOND_OPENERS = [
  'رجعت أطمّن: الكورس لسه مفتوح ومستني.',
  'المحاضرات ماشية، ولسه فيه وقت نلحق من الأول.',
  'لسه الكورس مستني من ساعة ما الحساب اتعمل.',
] as const;

/** The course was picked from the student's own year and stream. */
export const SIGNUP_BODIES = [
  'الكورس اللي على سنتك هو «{course}»، وكل المحاضرات فيه مترتبة من الأولى:',
  'على حسب سنتك، الكورس المناسب هو «{course}»:',
  'كورس «{course}» هو اللي على مقاس سنتك بالظبط:',
] as const;

/**
 * The profile does not say enough to pick one. NOT the pool above with a blank
 * in it — the same reason as `SUBSCRIBE_BODIES_UNKNOWN`.
 */
export const SIGNUP_BODIES_UNKNOWN = [
  'كل الكورسات موجودة في صفحة واحدة، وكل سنة ليها كورسها:',
  'صفحة الكورسات فيها كورس لكل سنة، مترتبين:',
] as const;

export const SIGNUP_CLOSERS = [
  'اللينك اللي فوق بيفتح الصفحة على طول، وأي سؤال قبل البداية أنا هنا.',
  'ولو فيه أي سؤال عن الكورس أو طريقة الدفع، الرد هنا.',
  'أي استفسار قبل البداية، رسالة هنا كفاية.',
] as const;
