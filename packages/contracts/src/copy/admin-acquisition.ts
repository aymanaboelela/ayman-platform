/**
 * «مصادر التسجيل» — the admin screen that says what each ad link brought:
 * new accounts, how many of them paid, and how much.
 *
 * Egyptian Arabic, admin-facing. No instructor name anywhere: the copy table
 * is shared by every stack and the tenant-identity guard walks it.
 */
export const adminAcquisitionCopy = {
  /** The tab under «التحليلات». */
  nav: 'مصادر التسجيل',
  title: 'مصادر التسجيل',
  lead: 'كل لينك إعلان جاب كام حساب جديد، وكام واحد منهم دفع اشتراك، ودفعوا كام. الأرقام من المنصة نفسها، من غير أي كود من فيسبوك أو غيره.',

  rangeLabel: 'الحسابات اللي اتعملت في',
  range7: 'آخر أسبوع',
  range30: 'آخر ٣٠ يوم',
  range90: 'آخر ٩٠ يوم',
  rangeAll: 'من الأول',

  tileSignups: 'حسابات جديدة من الإعلانات',
  tileSignupsContext: 'من {n} حملة',
  tilePaid: 'دفعوا اشتراك',
  /** `{share}` is already a percentage — «12%». */
  tilePaidContext: '{share} من الحسابات دي',
  tilePaidNone: 'لسه محدش منهم دفع',
  tileRevenue: 'دفعوا كام',
  tileRevenueContext: 'اشتراكات وشحن محفظة',

  tableTitle: 'كل حملة لوحدها',
  colCampaign: 'الحملة',
  colSignups: 'حسابات جديدة',
  colPaid: 'دفعوا',
  colRevenue: 'الإيراد',
  /** A link that carried no `utm_campaign` — never an empty cell. */
  noCampaign: 'من غير اسم حملة',
  /** `{shown}` of `{total}` campaigns are listed; the tiles count all of them. */
  truncated: 'ظاهر أعلى {shown} حملة من {total}. الأرقام اللي فوق محسوبة على الكل.',

  empty: 'مفيش حسابات جت من لينك إعلان في الفترة دي.',
  emptyHint: 'اللينك اللي بيتحط في الإعلان لازم يبقى في آخره اسم المصدر والحملة، بالشكل ده:',
  /** Shown as code, left-to-right. The campaign name is whatever the ad is called. */
  emptyExample: '?utm_source=facebook&utm_medium=paid&utm_campaign=campaign-name',

  notesTitle: 'الأرقام دي معناها إيه',
  noteWindow: 'الفترة بتختار الحسابات باليوم اللي اتعملت فيه. «دفعوا» و«الإيراد» هم كل اللي الحسابات دي دفعته من ساعتها لحد دلوقتي، حتى لو الدفع كان بعد الفترة.',
  notePaid: '«دفعوا» يعني اشتراك مدفوع اتوافق عليه، مش اشتراك مجاني. «الإيراد» هو فلوس الاشتراكات وشحن المحفظة قبل أي استرداد، ومن غير الكتب.',
  noteFirstTouch: 'الحساب بيتحسب لأول لينك إعلان اتفتح على نفس الموبايل ونفس المتصفح خلال ٣٠ يوم قبل ما الحساب يتعمل. لو الإعلان اتفتح على جهاز والحساب اتعمل من جهاز تاني، مش هيتحسب لأي حملة.',
  noteFacebook: 'لينك اتفتح من فيسبوك ومفيش فيه اسم حملة بيظهر «من غير اسم حملة» وتحته facebook. والنسبة اللي تحت «دفعوا» هي نسبتهم من حسابات الحملة نفسها.',
} as const;
