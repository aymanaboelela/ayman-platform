/**
 * «نسيت كلمة السر» — the two-step page under `(auth)`, the WhatsApp message
 * that carries the code, and the two assistant answers that describe the flow
 * on a stack where it is switched on.
 *
 * Its own module rather than new keys on `copy/ar.ts`: a new block of copy
 * goes in a new file (Turbopack module ids outlive a deploy — see
 * `docs/agents/pitfalls.md`), and this one is read by the API at runtime too.
 *
 * Two rules every line here is held to, by `password-reset-voice.spec.ts`:
 *
 *   · NOTHING IS GENDERED. The student is never asked boy or girl, so there
 *     are no imperatives («اكتب», «تجاهل»), only verbal nouns, nominal
 *     sentences and the first person plural.
 *   · NO NAME. This file ships to every stack. The platform's name reaches the
 *     WhatsApp message through `tenantName(copy.site.platformName)` at the
 *     call site, never as a literal here.
 */
export const passwordResetCopy = {
  /** The link under the password field on `/login`. */
  loginLink: 'نسيت كلمة السر؟',

  title: 'تغيير كلمة السر',
  subtitle: 'بنبعت كود من 6 أرقام على الواتساب، على رقم الموبايل اللي الحساب متسجّل بيه.',

  phoneStep: {
    send: 'إرسال الكود',
    sending: 'بنبعت…',
  },

  codeStep: {
    /** `{phone}` — the number as typed, national form. */
    sent: 'لو الرقم {phone} متسجّل على المنصة، الكود في الطريق على الواتساب دلوقتي. صالح 10 دقايق ولمرة واحدة.',
    codeLabel: 'الكود',
    codeHint: '6 أرقام، من رسالة الواتساب.',
    newPassword: 'كلمة السر الجديدة',
    confirmPassword: 'تأكيد كلمة السر الجديدة',
    submit: 'تغيير كلمة السر',
    submitting: 'بنغيّرها…',
    resend: 'إرسال كود جديد',
    /** `{seconds}` */
    resendIn: 'كود جديد بعد {seconds} ثانية',
    changeNumber: 'رقم تاني',
    /**
     * Shown under the code field from the start, not only after a failure.
     * A send that fails AFTER the response (the device dropped, WhatsApp
     * refused the chat) is invisible to this page by design — telling the
     * page would tell everyone whether the number has an account — so the
     * way out has to be on screen before anybody needs it.
     */
    notArrived: 'الكود ممكن ياخد دقيقة. لو موصلش خالص، الفريق بيغيّر كلمة السر في دقايق.',
  },

  /** The link that opens a chat with the stack's own support number. */
  contactTeam: 'رسالة للفريق على الواتساب',

  done: {
    title: 'اتغيّرت كلمة السر',
    body: 'وكل الأجهزة اللي كانت داخلة على الحساب خرجت. الدخول دلوقتي بالرقم وكلمة السر الجديدة.',
    action: 'صفحة الدخول',
  },

  google: {
    title: 'الحساب ده بيدخل بجوجل',
    body: 'مافيهوش كلمة سر تتغيّر من الأساس. الدخول من زرار «المتابعة بحساب جوجل» في صفحة الدخول.',
    action: 'صفحة الدخول',
  },

  errors: {
    /**
     * ONE sentence for every way the confirm step can fail — a wrong code, an
     * expired one, a used one, a burned one, a number with no account. They
     * are one answer on the server too, and splitting them here would rebuild
     * the oracle the server refuses to be.
     */
    invalidCode: 'الكود مش مظبوط أو انتهى. فيه كود جديد من «إرسال كود جديد» تحت.',
    mismatch: 'التأكيد مش زي كلمة السر الجديدة.',
    humanCheck: 'مقدرناش نتأكد إن الطلب من شخص مش برنامج. نجرّب تاني.',
    /** A request limit — the same words for every number, registered or not. */
    limited: 'طلبات كتير ورا بعض. محاولة تانية بعد شوية، أو رسالة للفريق على الواتساب.',
    /** The stack cannot send right now — said to everyone alike. */
    unavailable:
      'إرسال الكود واقف دلوقتي. الفريق بيغيّر كلمة السر في دقايق — رسالة على الواتساب فيها الاسم ورقم الموبايل بتاع الحساب.',
    failed: 'حصل خطأ ومقدرناش نكمّل. نجرّب تاني.',
  },

  /**
   * The WhatsApp message. `{platform}` is `tenantName(copy.site.platformName)`,
   * `{code}` the six digits, `{minutes}` the lifetime.
   *
   * The code is on a line of its own so WhatsApp's long-press copies just the
   * digits, and the warning comes straight after it: a code that arrives
   * unasked is the moment somebody is trying to talk a student out of it.
   */
  message:
    '{platform}\nكود تغيير كلمة السر: {code}\nصالح {minutes} دقايق ولمرة واحدة.\nالكود ده سرّي — محدش من المنصة هيطلبه أبدًا.\nلو الطلب ده مش من صاحب الحساب، مفيش حاجة مطلوبة وكلمة السر زي ما هي.',

  /**
   * المساعد's two answers about a lost password, on a stack where this flow
   * is ON. `copy.assistant.knowledge.passwordLost` and
   * `copy.assistant.script.accountPassword` stay the answers where it is off
   * — they send the student to the instructor, which is the only way there.
   * `assistant-knowledge.ts` picks between them.
   */
  assistant: {
    passwordLost:
      'من صفحة الدخول: دوسة على «نسيت كلمة السر؟» وكتابة رقم الموبايل بتاع الحساب، وبيوصل كود من 6 أرقام على الواتساب بتتغيّر بيه كلمة السر في دقيقة. ولو الكود موصلش، الفريق بيظبّطها — رسالة من زرار التواصل تحت فيها الاسم والرقم. والحساب اللي اتعمل بجوجل مافيهوش كلمة سر، والدخول بيتم من زرار «المتابعة بحساب جوجل».',
    accountPassword:
      'فيه «نسيت كلمة السر؟» تحت خانة كلمة السر في صفحة الدخول. رقم الموبايل بتاع الحساب، وبعدها كود من 6 أرقام بيوصل على الواتساب وكلمة سر جديدة — والأجهزة اللي كانت داخلة بتخرج كلها. الكود صالح 10 دقايق ولمرة واحدة. ولو الكود موصلش خالص، رسالة للفريق من هنا فيها الاسم والرقم، وكلمة السر بتتظبط من عندنا. والحساب اللي اتعمل بجوجل مافيهوش كلمة سر من الأساس، والدخول بيتم من زرار «المتابعة بحساب جوجل».',
  },
} as const;
