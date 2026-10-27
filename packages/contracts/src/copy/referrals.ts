/**
 * «دعوة صحابك» — the student's page, and the message a student forwards.
 *
 * Egyptian Arabic, and never addressed in the masculine (CLAUDE.md §7): the
 * ـك suffix only on nouns («محفظتك»، «بتاعك»), masdar buttons («نسخ»،
 * «مشاركة»), nominal sentences everywhere else. The friend is unknown too, so
 * the friend is never «هو» either — «الحساب الجديد» instead.
 *
 * No instructor name anywhere. The platform's own name reaches the forwarded
 * message as `{platform}`, resolved by the page from `tenantName`.
 */
export const referralsCopy = {
  pageTitle: 'دعوة صحابك',
  eyebrow: 'دعوة صحابك',
  /** `{amount}` — the referrer's reward in pounds. */
  heroTitle: '{amount} جنيه في محفظتك عن كل صاحب يشترك',
  /** `{amount}` the referrer's reward, `{friend}` the friend's. */
  heroLead:
    'اللينك ده بتاعك لوحدك. أي حساب يتعمل منه ويدفع أول اشتراك، بينزل {amount} جنيه في محفظتك، و{friend} جنيه هدية في محفظة الحساب الجديد.',
  heroLeadNoFriend:
    'اللينك ده بتاعك لوحدك. أي حساب يتعمل منه ويدفع أول اشتراك، بينزل {amount} جنيه في محفظتك.',
  linkLabel: 'لينك الدعوة',
  codeLabel: 'الكود',
  copyLink: 'نسخ اللينك',
  copied: 'اتنسخ',
  shareWhatsapp: 'مشاركة على واتساب',
  /**
   * What the student forwards. Written in THEIR voice, to a friend whose
   * gender nobody knows — so no «سجّل/سجّلي», only nominal sentences.
   * `{platform}` the platform's name, `{friend}` the friend's gift in pounds,
   * `{url}` the link, alone on the last line so WhatsApp previews it.
   */
  shareMessage:
    'أنا بذاكر على منصة {platform} والشرح فيها مختلف بجد.\nالحساب من اللينك ده عليه {friend} جنيه هدية في المحفظة مع أول اشتراك:\n{url}',
  shareMessageNoFriend: 'أنا بذاكر على منصة {platform} والشرح فيها مختلف بجد.\nاللينك:\n{url}',

  statsTitle: 'لحد دلوقتي',
  statJoined: 'سجّلوا من اللينك',
  statPaid: 'دفعوا أول اشتراك',
  statCredited: 'مكافآت نزلت',
  statEarned: 'إجمالي المكافآت',
  currency: 'جنيه',

  stepsTitle: 'بتشتغل إزاي؟',
  steps: [
    'مشاركة اللينك مع الصحاب على واتساب أو في أي مكان.',
    'الحساب الجديد بيتعمل من اللينك نفسه.',
    'أول اشتراك مدفوع على الحساب ده.',
    'المكافأة بتنزل في المحفظتين لوحدها — من غير طلب ولا انتظار.',
  ],
  /** `{days}` — the attribution window. */
  rules:
    'المكافأة على أول دفعة حقيقية بس، مش كود ولا هدية. ولو الفلوس اترجعت، المكافأة بترجع معاها. اللينك بيتحسب لمدة {days} يوم من آخر مرة اتفتح فيها.',

  friendsTitle: 'الصحاب اللي سجّلوا',
  friendsEmpty: 'لسه مفيش حد سجّل من اللينك — أول صاحب هيظهر هنا.',
  friendStatus: {
    joined: 'لسه من غير اشتراك',
    credited: 'المكافأة نزلت',
    reversed: 'المكافأة اترجعت',
    closed: 'مش محسوبة',
  },

  inactiveTitle: 'البرنامج واقف دلوقتي',
  inactiveBody: 'اللينك محفوظ زي ما هو. أول ما البرنامج يرجع، أي تسجيل منه هيتحسب.',
  walletCta: 'فتح المحفظة',

  /** `/invited` — a signed-in browser opened someone's `/r/<code>`. */
  signedInTitle: 'اللينك ده لعمل حساب جديد',
  /** `{name}` — the account this browser is signed into. */
  signedInBody:
    'المتصفح ده داخل دلوقتي بحساب «{name}». الدعوة بتتحسب لحساب جديد بس — يعني الخروج من الحساب ده الأول، وبعدها التسجيل من نفس المتصفح بيتحسب لصاحب اللينك.',
  signedInSwitch: 'خروج وعمل حساب جديد',
  signedInSwitching: 'جاري الخروج…',
  signedInStay: 'رجوع لحسابي',
} as const;
