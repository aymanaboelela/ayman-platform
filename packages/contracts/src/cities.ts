/**
 * Egypt's cities and districts, by governorate — the list behind «المدينة» on
 * the onboarding wizard and the profile editor.
 *
 * A leaf module with no imports, on purpose, and a NEW file rather than an
 * export added to `onboarding.ts` or `taxonomy.ts`: those are evaluated in
 * the browser, and Turbopack's module ids are path-derived, so a new export on
 * an existing module leaves every tab from the previous build reading
 * `undefined`. It is also imported by `onboarding.ts` through its SUBPATH
 * (`@ayman/contracts/cities`), never relatively — a relative import passes
 * tsc and jest and then kills the API under Node ESM
 * (`apps/api/test/contracts-barrel.check.ts`).
 *
 * Static rather than a table. The API validates with the same
 * `OnboardingSchema` the form does (`OnboardingDto` is `createZodDto` of it),
 * so membership is checked on both sides from this one list, and there is no
 * seed row that a failed boot-time seed could leave missing — on a tenant's
 * fresh database an empty `cities` table would have rejected every sign-up.
 * `student_profiles.city_id` stores the id; ids are the source dataset's and
 * are never renumbered, so a stored id keeps meaning the same place.
 *
 * Keys are OUR governorate codes (national-ID order, as in
 * `apps/api/src/scripts/seed-data/governorates.ts`); each list is sorted the
 * way `Intl.Collator('ar')` sorts it, which is the order a student scans.
 *
 * ## Source and licence
 *
 * github.com/Tech-Labs/egypt-governorates-and-cities-db — 396 cities, cleaned
 * to 390: six rows dropped as filed under the wrong governorate or duplicated
 * (العاشر من رمضان and مدينة العبور under القاهرة, مارينا under الإسكندرية,
 * مرسى علم under أسوان, a second اطسا, a second وسط البلد in كفر الشيخ) and 27
 * spellings corrected (final ى → ي, missing hamzas, «العباسية», «أبو تشت»).
 *
 * MIT License — Copyright (c) 2016 Ibrahim Mohamed Abotaleb
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export interface City {
  /** The source dataset's id. Stored in `student_profiles.city_id`. */
  id: number;
  nameAr: string;
}

export const CITIES: Readonly<Record<string, readonly City[]>> = {
  '11': [
    { id: 301, nameAr: 'الروضة' },
    { id: 299, nameAr: 'الزرقا' },
    { id: 300, nameAr: 'السرو' },
    { id: 295, nameAr: 'دمياط' },
    { id: 296, nameAr: 'دمياط الجديدة' },
    { id: 297, nameAr: 'رأس البر' },
    { id: 303, nameAr: 'عزبة البرج' },
    { id: 298, nameAr: 'فارسكور' },
    { id: 302, nameAr: 'كفر البطيخ' },
    { id: 305, nameAr: 'كفر سعد' },
    { id: 304, nameAr: 'ميت أبو غالب' },
  ],
  '12': [
    { id: 141, nameAr: 'أجا' },
    { id: 148, nameAr: 'الجمالية' },
    { id: 143, nameAr: 'السنبلاوين' },
    { id: 144, nameAr: 'الكردي' },
    { id: 150, nameAr: 'المطرية' },
    { id: 146, nameAr: 'المنزلة' },
    { id: 137, nameAr: 'المنصورة' },
    { id: 151, nameAr: 'بلقاس' },
    { id: 145, nameAr: 'بني عبيد' },
    { id: 147, nameAr: 'تمي الأمديد' },
    { id: 153, nameAr: 'جمصة' },
    { id: 140, nameAr: 'دكرنس' },
    { id: 149, nameAr: 'شربين' },
    { id: 138, nameAr: 'طلخا' },
    { id: 154, nameAr: 'محلة دمنة' },
    { id: 142, nameAr: 'منية النصر' },
    { id: 152, nameAr: 'ميت سلسيل' },
    { id: 139, nameAr: 'ميت غمر' },
    { id: 155, nameAr: 'نبروه' },
  ],
  '13': [
    { id: 312, nameAr: 'أبو حماد' },
    { id: 315, nameAr: 'أبو كبير' },
    { id: 318, nameAr: 'الإبراهيمية' },
    { id: 322, nameAr: 'الحسينية' },
    { id: 306, nameAr: 'الزقازيق' },
    { id: 317, nameAr: 'الصالحية الجديدة' },
    { id: 307, nameAr: 'العاشر من رمضان' },
    { id: 313, nameAr: 'القرين' },
    { id: 311, nameAr: 'القنايات' },
    { id: 321, nameAr: 'أولاد صقر' },
    { id: 309, nameAr: 'بلبيس' },
    { id: 319, nameAr: 'ديرب نجم' },
    { id: 323, nameAr: 'صان الحجر القبلية' },
    { id: 316, nameAr: 'فاقوس' },
    { id: 320, nameAr: 'كفر صقر' },
    { id: 310, nameAr: 'مشتول السوق' },
    { id: 324, nameAr: 'منشأة أبو عمر' },
    { id: 308, nameAr: 'منيا القمح' },
    { id: 314, nameAr: 'ههيا' },
  ],
  '14': [
    { id: 235, nameAr: 'الخانكة' },
    { id: 240, nameAr: 'الخصوص' },
    { id: 239, nameAr: 'العبور' },
    { id: 234, nameAr: 'القناطر الخيرية' },
    { id: 231, nameAr: 'بنها' },
    { id: 233, nameAr: 'شبرا الخيمة' },
    { id: 241, nameAr: 'شبين القناطر' },
    { id: 237, nameAr: 'طوخ' },
    { id: 232, nameAr: 'قليوب' },
    { id: 238, nameAr: 'قها' },
    { id: 236, nameAr: 'كفر شكر' },
    { id: 242, nameAr: 'مسطرد' },
  ],
  '15': [
    { id: 342, nameAr: 'الحامول' },
    { id: 344, nameAr: 'الرياض' },
    { id: 339, nameAr: 'برج البرلس' },
    { id: 340, nameAr: 'بلطيم' },
    { id: 343, nameAr: 'بيلا' },
    { id: 336, nameAr: 'دسوق' },
    { id: 345, nameAr: 'سيدي سالم' },
    { id: 347, nameAr: 'سيدي غازي' },
    { id: 337, nameAr: 'فوه' },
    { id: 346, nameAr: 'قلين' },
    { id: 334, nameAr: 'كفر الشيخ' },
    { id: 341, nameAr: 'مصيف بلطيم' },
    { id: 338, nameAr: 'مطوبس' },
  ],
  '16': [
    { id: 196, nameAr: 'السنطة' },
    { id: 193, nameAr: 'المحلة الكبرى' },
    { id: 198, nameAr: 'بسيون' },
    { id: 195, nameAr: 'زفتى' },
    { id: 199, nameAr: 'سمنود' },
    { id: 192, nameAr: 'طنطا' },
    { id: 197, nameAr: 'قطور' },
    { id: 194, nameAr: 'كفر الزيات' },
  ],
  '17': [
    { id: 213, nameAr: 'أشمون' },
    { id: 214, nameAr: 'الباجور' },
    { id: 218, nameAr: 'الشهداء' },
    { id: 216, nameAr: 'بركة السبع' },
    { id: 217, nameAr: 'تلا' },
    { id: 212, nameAr: 'سرس الليان' },
    { id: 209, nameAr: 'شبين الكوم' },
    { id: 215, nameAr: 'قويسنا' },
    { id: 210, nameAr: 'مدينة السادات' },
    { id: 211, nameAr: 'منوف' },
  ],
  '18': [
    { id: 168, nameAr: 'أبو المطامير' },
    { id: 169, nameAr: 'أبو حمص' },
    { id: 167, nameAr: 'إدكو' },
    { id: 170, nameAr: 'الدلنجات' },
    { id: 172, nameAr: 'الرحمانية' },
    { id: 171, nameAr: 'المحمودية' },
    { id: 180, nameAr: 'النوبارية' },
    { id: 179, nameAr: 'النوبارية الجديدة' },
    { id: 173, nameAr: 'إيتاي البارود' },
    { id: 177, nameAr: 'بدر' },
    { id: 174, nameAr: 'حوش عيسى' },
    { id: 164, nameAr: 'دمنهور' },
    { id: 166, nameAr: 'رشيد' },
    { id: 175, nameAr: 'شبراخيت' },
    { id: 165, nameAr: 'كفر الدوار' },
    { id: 176, nameAr: 'كوم حمادة' },
    { id: 178, nameAr: 'وادي النطرون' },
  ],
  '19': [
    { id: 205, nameAr: 'أبو صوير' },
    { id: 200, nameAr: 'الإسماعيلية' },
    { id: 204, nameAr: 'التل الكبير' },
    { id: 208, nameAr: 'الشيخ زايد' },
    { id: 206, nameAr: 'القصاصين الجديدة' },
    { id: 202, nameAr: 'القنطرة شرق' },
    { id: 203, nameAr: 'القنطرة غرب' },
    { id: 201, nameAr: 'فايد' },
    { id: 207, nameAr: 'نفيشة' },
  ],
  '21': [
    { id: 70, nameAr: 'أبو النمرس' },
    { id: 86, nameAr: 'أبو رواش' },
    { id: 92, nameAr: 'أرض اللواء' },
    { id: 64, nameAr: 'أطفيح' },
    { id: 66, nameAr: 'الباويطي' },
    { id: 62, nameAr: 'البدرشين' },
    { id: 58, nameAr: 'الجيزة' },
    { id: 88, nameAr: 'الحرانية' },
    { id: 61, nameAr: 'الحوامدية' },
    { id: 73, nameAr: 'الدقي' },
    { id: 59, nameAr: 'السادس من أكتوبر' },
    { id: 60, nameAr: 'الشيخ زايد' },
    { id: 63, nameAr: 'الصف' },
    { id: 74, nameAr: 'العجوزة' },
    { id: 80, nameAr: 'العمرانية' },
    { id: 65, nameAr: 'العياط' },
    { id: 91, nameAr: 'القرية الذكية' },
    { id: 83, nameAr: 'الكيت كات' },
    { id: 81, nameAr: 'المنيب' },
    { id: 84, nameAr: 'المهندسين' },
    { id: 75, nameAr: 'الهرم' },
    { id: 79, nameAr: 'الواحات البحرية' },
    { id: 76, nameAr: 'الوراق' },
    { id: 77, nameAr: 'إمبابة' },
    { id: 68, nameAr: 'أوسيم' },
    { id: 78, nameAr: 'بولاق الدكرور' },
    { id: 82, nameAr: 'بين السرايات' },
    { id: 89, nameAr: 'حدائق أكتوبر' },
    { id: 87, nameAr: 'حدائق الأهرام' },
    { id: 90, nameAr: 'صفط اللبن' },
    { id: 85, nameAr: 'فيصل' },
    { id: 69, nameAr: 'كرداسة' },
    { id: 71, nameAr: 'كفر غطاطي' },
    { id: 72, nameAr: 'منشأة البكاري' },
    { id: 67, nameAr: 'منشأة القناطر' },
  ],
  '22': [
    { id: 285, nameAr: 'الأباصيري' },
    { id: 283, nameAr: 'الفشن' },
    { id: 279, nameAr: 'الواسطى' },
    { id: 281, nameAr: 'إهناسيا' },
    { id: 282, nameAr: 'ببا' },
    { id: 277, nameAr: 'بني سويف' },
    { id: 278, nameAr: 'بني سويف الجديدة' },
    { id: 284, nameAr: 'سمسطا' },
    { id: 286, nameAr: 'مقبل' },
    { id: 280, nameAr: 'ناصر' },
  ],
  '23': [
    { id: 186, nameAr: 'إبشواي' },
    { id: 185, nameAr: 'إطسا' },
    { id: 190, nameAr: 'الجامعة' },
    { id: 188, nameAr: 'الحادقة' },
    { id: 191, nameAr: 'السيالة' },
    { id: 181, nameAr: 'الفيوم' },
    { id: 182, nameAr: 'الفيوم الجديدة' },
    { id: 184, nameAr: 'سنورس' },
    { id: 183, nameAr: 'طامية' },
    { id: 187, nameAr: 'يوسف الصديق' },
  ],
  '24': [
    { id: 229, nameAr: 'أبو قرقاص' },
    { id: 230, nameAr: 'أرض سلطان' },
    { id: 221, nameAr: 'العدوة' },
    { id: 226, nameAr: 'المدينة الفكرية' },
    { id: 219, nameAr: 'المنيا' },
    { id: 220, nameAr: 'المنيا الجديدة' },
    { id: 223, nameAr: 'بني مزار' },
    { id: 228, nameAr: 'دير مواس' },
    { id: 225, nameAr: 'سمالوط' },
    { id: 224, nameAr: 'مطاي' },
    { id: 222, nameAr: 'مغاغة' },
    { id: 227, nameAr: 'ملوي' },
  ],
  '25': [
    { id: 271, nameAr: 'أبنوب' },
    { id: 272, nameAr: 'أبو تيج' },
    { id: 266, nameAr: 'أسيوط' },
    { id: 267, nameAr: 'أسيوط الجديدة' },
    { id: 275, nameAr: 'البداري' },
    { id: 273, nameAr: 'الغنايم' },
    { id: 270, nameAr: 'القوصية' },
    { id: 268, nameAr: 'ديروط' },
    { id: 274, nameAr: 'ساحل سليم' },
    { id: 276, nameAr: 'صدفا' },
    { id: 269, nameAr: 'منفلوط' },
  ],
  '26': [
    { id: 385, nameAr: 'أخميم' },
    { id: 386, nameAr: 'أخميم الجديدة' },
    { id: 387, nameAr: 'البلينا' },
    { id: 396, nameAr: 'الكوثر' },
    { id: 388, nameAr: 'المراغة' },
    { id: 389, nameAr: 'المنشأة' },
    { id: 391, nameAr: 'جرجا' },
    { id: 392, nameAr: 'جهينة الغربية' },
    { id: 390, nameAr: 'دار السلام' },
    { id: 393, nameAr: 'ساقلته' },
    { id: 383, nameAr: 'سوهاج' },
    { id: 384, nameAr: 'سوهاج الجديدة' },
    { id: 394, nameAr: 'طما' },
    { id: 395, nameAr: 'طهطا' },
  ],
  '27': [
    { id: 369, nameAr: 'أبو تشت' },
    { id: 372, nameAr: 'الوقف' },
    { id: 371, nameAr: 'دشنا' },
    { id: 375, nameAr: 'فرشوط' },
    { id: 373, nameAr: 'قفط' },
    { id: 367, nameAr: 'قنا' },
    { id: 368, nameAr: 'قنا الجديدة' },
    { id: 376, nameAr: 'قوص' },
    { id: 370, nameAr: 'نجع حمادي' },
    { id: 374, nameAr: 'نقادة' },
  ],
  '28': [
    { id: 264, nameAr: 'أبو سمبل السياحية' },
    { id: 260, nameAr: 'إدفو' },
    { id: 254, nameAr: 'أسوان' },
    { id: 255, nameAr: 'أسوان الجديدة' },
    { id: 262, nameAr: 'البصيلية' },
    { id: 261, nameAr: 'الرديسية' },
    { id: 263, nameAr: 'السباعية' },
    { id: 256, nameAr: 'دراو' },
    { id: 259, nameAr: 'كلابشة' },
    { id: 257, nameAr: 'كوم أمبو' },
    { id: 258, nameAr: 'نصر النوبة' },
  ],
  '29': [
    { id: 365, nameAr: 'أرمنت' },
    { id: 360, nameAr: 'إسنا' },
    { id: 358, nameAr: 'الأقصر' },
    { id: 359, nameAr: 'الأقصر الجديدة' },
    { id: 363, nameAr: 'البياضية' },
    { id: 362, nameAr: 'الزينية' },
    { id: 366, nameAr: 'الطود' },
    { id: 364, nameAr: 'القرنة' },
    { id: 361, nameAr: 'طيبة الجديدة' },
  ],
  '31': [
    { id: 163, nameAr: 'الدهار' },
    { id: 161, nameAr: 'الشلاتين' },
    { id: 156, nameAr: 'الغردقة' },
    { id: 159, nameAr: 'القصير' },
    { id: 162, nameAr: 'حلايب' },
    { id: 157, nameAr: 'رأس غارب' },
    { id: 158, nameAr: 'سفاجا' },
    { id: 160, nameAr: 'مرسى علم' },
  ],
  '32': [
    { id: 243, nameAr: 'الخارجة' },
    { id: 248, nameAr: 'الداخلة' },
    { id: 246, nameAr: 'الفرافرة' },
    { id: 244, nameAr: 'باريس' },
    { id: 247, nameAr: 'بلاط' },
    { id: 245, nameAr: 'موط' },
  ],
  '33': [
    { id: 349, nameAr: 'الحمام' },
    { id: 357, nameAr: 'الساحل الشمالي' },
    { id: 354, nameAr: 'السلوم' },
    { id: 351, nameAr: 'الضبعة' },
    { id: 350, nameAr: 'العلمين' },
    { id: 352, nameAr: 'النجيلة' },
    { id: 353, nameAr: 'سيدي براني' },
    { id: 355, nameAr: 'سيوة' },
    { id: 356, nameAr: 'مارينا' },
    { id: 348, nameAr: 'مرسى مطروح' },
  ],
  '34': [
    { id: 382, nameAr: 'الحسنة' },
    { id: 378, nameAr: 'الشيخ زويد' },
    { id: 377, nameAr: 'العريش' },
    { id: 381, nameAr: 'بئر العبد' },
    { id: 380, nameAr: 'رفح' },
    { id: 379, nameAr: 'نخل' },
  ],
  '35': [
    { id: 331, nameAr: 'أبو رديس' },
    { id: 332, nameAr: 'أبو زنيمة' },
    { id: 325, nameAr: 'الطور' },
    { id: 327, nameAr: 'دهب' },
    { id: 333, nameAr: 'رأس سدر' },
    { id: 330, nameAr: 'سانت كاترين' },
    { id: 326, nameAr: 'شرم الشيخ' },
    { id: 329, nameAr: 'طابا' },
    { id: 328, nameAr: 'نويبع' },
  ],
  '01': [
    { id: 1, nameAr: '15 مايو' },
    { id: 2, nameAr: 'الأزبكية' },
    { id: 3, nameAr: 'البساتين' },
    { id: 4, nameAr: 'التبين' },
    { id: 53, nameAr: 'الجمالية' },
    { id: 55, nameAr: 'الحلمية' },
    { id: 5, nameAr: 'الخليفة' },
    { id: 6, nameAr: 'الدراسة' },
    { id: 7, nameAr: 'الدرب الأحمر' },
    { id: 48, nameAr: 'الرحاب' },
    { id: 8, nameAr: 'الزاوية الحمراء' },
    { id: 46, nameAr: 'الزمالك' },
    { id: 9, nameAr: 'الزيتون' },
    { id: 10, nameAr: 'الساحل' },
    { id: 11, nameAr: 'السلام' },
    { id: 12, nameAr: 'السيدة زينب' },
    { id: 13, nameAr: 'الشرابية' },
    { id: 15, nameAr: 'الظاهر' },
    { id: 57, nameAr: 'العاصمة الإدارية' },
    { id: 37, nameAr: 'العباسية' },
    { id: 16, nameAr: 'العتبة' },
    { id: 17, nameAr: 'القاهرة الجديدة' },
    { id: 49, nameAr: 'القطامية' },
    { id: 18, nameAr: 'المرج' },
    { id: 20, nameAr: 'المطرية' },
    { id: 21, nameAr: 'المعادي' },
    { id: 22, nameAr: 'المعصرة' },
    { id: 23, nameAr: 'المقطم' },
    { id: 24, nameAr: 'المنيل' },
    { id: 25, nameAr: 'الموسكي' },
    { id: 26, nameAr: 'النزهة' },
    { id: 56, nameAr: 'النزهة الجديدة' },
    { id: 27, nameAr: 'الوايلي' },
    { id: 28, nameAr: 'باب الشعرية' },
    { id: 29, nameAr: 'بولاق' },
    { id: 30, nameAr: 'جاردن سيتي' },
    { id: 31, nameAr: 'حدائق القبة' },
    { id: 32, nameAr: 'حلوان' },
    { id: 33, nameAr: 'دار السلام' },
    { id: 51, nameAr: 'روض الفرج' },
    { id: 34, nameAr: 'شبرا' },
    { id: 52, nameAr: 'شيراتون' },
    { id: 35, nameAr: 'طره' },
    { id: 36, nameAr: 'عابدين' },
    { id: 19, nameAr: 'عزبة النخل' },
    { id: 38, nameAr: 'عين شمس' },
    { id: 47, nameAr: 'قصر النيل' },
    { id: 14, nameAr: 'مدينة الشروق' },
    { id: 43, nameAr: 'مدينة بدر' },
    { id: 39, nameAr: 'مدينة نصر' },
    { id: 50, nameAr: 'مدينتي' },
    { id: 40, nameAr: 'مصر الجديدة' },
    { id: 41, nameAr: 'مصر القديمة' },
    { id: 42, nameAr: 'منشية ناصر' },
    { id: 45, nameAr: 'وسط البلد' },
  ],
  '02': [
    { id: 93, nameAr: 'أبو قير' },
    { id: 94, nameAr: 'الإبراهيمية' },
    { id: 95, nameAr: 'الأزاريطة' },
    { id: 96, nameAr: 'الأنفوشي' },
    { id: 134, nameAr: 'الجمرك' },
    { id: 131, nameAr: 'الحضرة' },
    { id: 97, nameAr: 'الدخيلة' },
    { id: 130, nameAr: 'الساحل الشمالي' },
    { id: 98, nameAr: 'السيوف' },
    { id: 128, nameAr: 'الشاطبي' },
    { id: 99, nameAr: 'العامرية' },
    { id: 120, nameAr: 'العجمي' },
    { id: 119, nameAr: 'العصافرة' },
    { id: 132, nameAr: 'العطارين' },
    { id: 100, nameAr: 'اللبان' },
    { id: 125, nameAr: 'المعمورة' },
    { id: 101, nameAr: 'المفروزة' },
    { id: 135, nameAr: 'المكس' },
    { id: 102, nameAr: 'المنتزه' },
    { id: 126, nameAr: 'المندرة' },
    { id: 103, nameAr: 'المنشية' },
    { id: 104, nameAr: 'الناصرية' },
    { id: 105, nameAr: 'امبروزو' },
    { id: 106, nameAr: 'باب شرق' },
    { id: 107, nameAr: 'برج العرب' },
    { id: 121, nameAr: 'بكوس' },
    { id: 122, nameAr: 'بولكلي' },
    { id: 124, nameAr: 'جليم' },
    { id: 108, nameAr: 'ستانلي' },
    { id: 109, nameAr: 'سموحة' },
    { id: 110, nameAr: 'سيدي بشر' },
    { id: 129, nameAr: 'سيدي جابر' },
    { id: 133, nameAr: 'سيدي كرير' },
    { id: 111, nameAr: 'شدس' },
    { id: 112, nameAr: 'غيط العنب' },
    { id: 113, nameAr: 'فلمينج' },
    { id: 114, nameAr: 'فيكتوريا' },
    { id: 115, nameAr: 'كامب شيزار' },
    { id: 116, nameAr: 'كرموز' },
    { id: 123, nameAr: 'كليوباترا' },
    { id: 127, nameAr: 'محرم بك' },
    { id: 117, nameAr: 'محطة الرمل' },
    { id: 118, nameAr: 'مينا البصل' },
  ],
  '03': [
    { id: 289, nameAr: 'العرب' },
    { id: 287, nameAr: 'بورسعيد' },
    { id: 288, nameAr: 'بورفؤاد' },
    { id: 290, nameAr: 'حي الزهور' },
    { id: 291, nameAr: 'حي الشرق' },
    { id: 292, nameAr: 'حي الضواحي' },
    { id: 293, nameAr: 'حي المناخ' },
    { id: 294, nameAr: 'حي مبارك' },
  ],
  '04': [
    { id: 250, nameAr: 'الجناين' },
    { id: 249, nameAr: 'السويس' },
    { id: 252, nameAr: 'العين السخنة' },
    { id: 251, nameAr: 'عتاقة' },
    { id: 253, nameAr: 'فيصل' },
  ],
};

/** A governorate's cities, in display order — empty for an unknown code. */
export function citiesOf(governorateCode: string | null | undefined): readonly City[] {
  return (governorateCode && CITIES[governorateCode]) || [];
}

/**
 * Whether `cityId` is a city OF `governorateCode` — the one rule that stops a
 * payload pairing «مدينة نصر» with الإسكندرية.
 */
export function cityBelongsTo(governorateCode: string, cityId: number): boolean {
  return citiesOf(governorateCode).some((city) => city.id === cityId);
}

/** The Arabic name for a stored id, or null when there is none to show. */
export function cityNameAr(cityId: number | null | undefined): string | null {
  if (cityId == null) return null;
  for (const list of Object.values(CITIES)) {
    const found = list.find((city) => city.id === cityId);
    if (found) return found.nameAr;
  }
  return null;
}
