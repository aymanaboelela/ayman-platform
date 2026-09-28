/**
 * العربي زي ما بيتكتب على كيبورد موبايل — من غير همزة.
 *
 * المدرّس كتب «امجد» في بحث الطلبة، والطالب متسجّل «أمجد»، فالبحث قال
 * «مفيش حساب». `ILIKE` بيفرّق بين الحرفين دول زي ما بيفرّق بين «أ» و«ب».
 * والمصريين أغلبهم بيكتبوا من غير همزة — نفس المشكلة اللي
 * `lib/agents/webmcp-tools.ts` و`copy.seo.keywords` في الويب بيوثّقوها.
 *
 * ## الحرفين دول لازم يفضلوا متطابقين
 *
 * الطي بيحصل في مكانين: هنا على الكلمة اللي اتكتبت، وفي Postgres على الاسم
 * المتخزّن (`translate()`). لو واحد منهم طوى حرف والتاني لأ، البحث بيفوّت
 * نتايج من غير أي خطأ. فالاتنين بيتبنوا من نفس الثابتين تحت — `foldArabic`
 * بيلف عليهم، والاستعلام بيبعتهم باراميترز لـ`translate()`.
 *
 * `FOLD_FROM` أطول من `FOLD_TO` عن قصد: `translate()` بيمسح أي حرف مالوش
 * مقابل، وده اللي عايزينه للتطويل والتشكيل. `foldArabic` بيعمل نفس الحاجة.
 */

/** أ إ آ ٱ ى ة — وبعدهم اللي بيتمسح: التطويل والتشكيل (ً ٌ ٍ َ ُ ِ ّ ْ). */
export const FOLD_FROM = 'أإآٱىةـًٌٍَُِّْ';
/** ا ا ا ا ي ه — واحد لواحد مع أول ست حروف في `FOLD_FROM`. */
export const FOLD_TO = 'اااايه';

export function foldArabic(text: string): string {
  let out = '';
  for (const char of text.toLowerCase()) {
    const at = FOLD_FROM.indexOf(char);
    if (at === -1) out += char;
    else if (at < FOLD_TO.length) out += FOLD_TO[at];
    // غير كده: حرف بيتمسح، زي `translate()` بالظبط.
  }
  return out;
}

/** `%` و`_` و`\` في كلمة البحث حروف، مش وايلدكاردز. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
