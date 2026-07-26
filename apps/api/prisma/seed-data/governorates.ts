/**
 * The 27 Egyptian governorates in official national-ID code order — the order
 * government forms use. Codes are gap-numbered and encode region.
 * DO NOT sort alphabetically. Code 88 (خارج الجمهورية) is a national-ID code,
 * not a governorate, and is deliberately absent.
 */
export const GOVERNORATES = [
  { code: '01', nameAr: 'القاهرة', slug: 'cairo', region: 'urban' },
  { code: '02', nameAr: 'الإسكندرية', slug: 'alexandria', region: 'urban' },
  { code: '03', nameAr: 'بورسعيد', slug: 'port_said', region: 'urban' },
  { code: '04', nameAr: 'السويس', slug: 'suez', region: 'urban' },
  { code: '11', nameAr: 'دمياط', slug: 'damietta', region: 'lower' },
  { code: '12', nameAr: 'الدقهلية', slug: 'dakahlia', region: 'lower' },
  { code: '13', nameAr: 'الشرقية', slug: 'sharqia', region: 'lower' },
  { code: '14', nameAr: 'القليوبية', slug: 'qalyubia', region: 'lower' },
  { code: '15', nameAr: 'كفر الشيخ', slug: 'kafr_el_sheikh', region: 'lower' },
  { code: '16', nameAr: 'الغربية', slug: 'gharbia', region: 'lower' },
  { code: '17', nameAr: 'المنوفية', slug: 'monufia', region: 'lower' },
  { code: '18', nameAr: 'البحيرة', slug: 'beheira', region: 'lower' },
  { code: '19', nameAr: 'الإسماعيلية', slug: 'ismailia', region: 'lower' },
  { code: '21', nameAr: 'الجيزة', slug: 'giza', region: 'upper' },
  { code: '22', nameAr: 'بني سويف', slug: 'beni_suef', region: 'upper' },
  { code: '23', nameAr: 'الفيوم', slug: 'faiyum', region: 'upper' },
  { code: '24', nameAr: 'المنيا', slug: 'minya', region: 'upper' },
  { code: '25', nameAr: 'أسيوط', slug: 'asyut', region: 'upper' },
  { code: '26', nameAr: 'سوهاج', slug: 'sohag', region: 'upper' },
  { code: '27', nameAr: 'قنا', slug: 'qena', region: 'upper' },
  { code: '28', nameAr: 'أسوان', slug: 'aswan', region: 'upper' },
  { code: '29', nameAr: 'الأقصر', slug: 'luxor', region: 'upper' },
  { code: '31', nameAr: 'البحر الأحمر', slug: 'red_sea', region: 'frontier' },
  { code: '32', nameAr: 'الوادي الجديد', slug: 'new_valley', region: 'frontier' },
  { code: '33', nameAr: 'مطروح', slug: 'matrouh', region: 'frontier' },
  { code: '34', nameAr: 'شمال سيناء', slug: 'north_sinai', region: 'frontier' },
  { code: '35', nameAr: 'جنوب سيناء', slug: 'south_sinai', region: 'frontier' },
] as const;

/** Pinned to the top of the dropdown for UX; the rest render in code order. */
export const PINNED_GOVERNORATE_CODES = ['01', '21', '02'] as const;
