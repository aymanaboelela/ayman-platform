import type { ReactElement } from 'react';

/**
 * The small drawings that sit in an empty state.
 *
 * ## Why drawn, and why here
 *
 * An empty state was a sentence in a tinted box. It reads as a page that has
 * not finished loading rather than as a place waiting to be filled, and the
 * dashboard has three of them at once for a brand-new student — which is the
 * very first thing they ever see of the product.
 *
 * Built from the study surface's own tokens (`--e-*` for the structure,
 * `--a-*` for the one live element) rather than shipped as raster art, for the
 * same reasons `ExamGateMark` gives: it re-themes with the page, it is sharp
 * at any size, and it costs no request on the screen that has to paint fastest.
 *
 * `aria-hidden` on all of them: every one sits directly above copy that says
 * the same thing in words. A screen reader announcing the drawing would be
 * repetition, and none of them carry information the sentence does not.
 */

export type SpotName =
  | 'courses'
  | 'exams'
  | 'scores'
  | 'topics'
  | 'preparing'
  /* ── اللي تحت للوحة التحكم ────────────────────────────────────────────
     نفس الملف ونفس الكلاسات، مش نسخة تانية: `(admin)/layout.tsx` بيستورد
     `study.css` أصلًا (السطر ٨)، فالـ`.spot` شغّالة هناك من غير ما يتنقل
     حاجة. وجدول واحد معناه إن الرسمة اللي المدرّس بيشوفها في «المدفوعات»
     مرسومة بنفس القلم اللي الطالب بيشوفه في «نتايجي». */
  | 'payments'
  | 'transfers'
  | 'orders'
  | 'homework'
  | 'codes'
  | 'people'
  | 'inbox';

export function SpotIllustration({ name }: { name: SpotName }) {
  return (
    <svg
      className="spot"
      viewBox="0 0 120 84"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* The ground line every spot sits on, so the three read as a set. */}
      <path d="M18 72 H102" className="spot__ground" />

      {SPOTS[name]()}
    </svg>
  );
}

/** A short stack of books — "you have no courses yet". */
function Courses() {
  return (
    <g>
      <rect x="30" y="52" width="58" height="12" rx="3" className="spot__solid" />
      <rect x="35" y="40" width="48" height="12" rx="3" className="spot__line" />
      <rect x="42" y="28" width="34" height="12" rx="3" className="spot__accent" />
      {/* The spine marks: two short rules that make the blocks read as books
          rather than as bars on a chart. */}
      <path d="M38 56 h6 M43 44 h6 M50 32 h6" className="spot__mark" />
    </g>
  );
}

/**
 * محاضرات نص طريقها — «الشهر ده بيتجهّز».
 *
 * الشهر الفاضي مش زي الكورس الفاضي، ولا ينفع ياخد نفس الرسمة. الكورس الفاضي
 * حالة **وقفة**: مفيش حاجة، والطالب يروح مكان تاني. الشهر الفاضي حالة
 * **شغل ماشي**: هو دافع فيه، والمحاضرات جاية.
 *
 * فالرسمة ماشية من تحت لفوق: الصف اللي تحت متكمّل (`spot__solid`)، واللي
 * فوقه أقل، واللي فوق خالص خط فاضي لسه — الشكل بيقول «في النص» من غير كلمة.
 * والعنبري (`spot__accent`) على الصف اللي بيتشتغل فيه دلوقتي، لأنه الحاجة
 * الحية الوحيدة في الصورة.
 */
function Preparing() {
  return (
    <g>
      {/* خلّصت */}
      <rect x="30" y="54" width="58" height="10" rx="3" className="spot__solid" />
      {/* بتتشتغل دلوقتي — العنصر الحي الوحيد */}
      <rect x="30" y="40" width="38" height="10" rx="3" className="spot__accent" />
      {/* لسه — إطار فاضي، مش كتلة */}
      <rect x="30" y="26" width="58" height="10" rx="3" className="spot__line" />
      {/* تلات نقط: «وكمان» — نفس الإيماءة اللي الشاشة بتقولها بالكلام. */}
      <circle cx="74" cy="45" r="2" className="spot__accent-fill" />
      <circle cx="81" cy="45" r="2" className="spot__accent-fill" />
      <circle cx="88" cy="45" r="2" className="spot__accent-fill" />
    </g>
  );
}

/** A paper with a tick — "no exam sat yet". */
function Exams() {
  return (
    <g>
      <rect x="38" y="20" width="44" height="46" rx="4" className="spot__solid" />
      <path d="M46 32 h28 M46 41 h22 M46 50 h25" className="spot__mark" />
      <circle cx="82" cy="58" r="11" className="spot__accent-fill" />
      <path d="M77 58 l4 4 l7 -8" className="spot__accent-glyph" />
    </g>
  );
}

/** A lens over a short list — "we have not measured you yet".
 *
 *  Serves BOTH of the mastery card's quiet states: nothing measured, and
 *  everything above the bar. They differ in what they say, not in what they
 *  are looking at, and a second drawing of the same subject would be weight
 *  for no information. */
function Topics() {
  return (
    <g>
      <rect x="26" y="24" width="46" height="42" rx="4" className="spot__solid" />
      <path d="M34 36 h26 M34 45 h20 M34 54 h23" className="spot__mark" />
      <circle cx="80" cy="44" r="16" className="spot__accent-fill" />
      <circle cx="80" cy="44" r="9" className="spot__line" />
      <path d="M91 55 l8 8" className="spot__accent-glyph" />
    </g>
  );
}

/** Three rising bars — "no scores yet". */
function Scores() {
  return (
    <g>
      <rect x="34" y="50" width="14" height="18" rx="3" className="spot__line" />
      <rect x="53" y="38" width="14" height="30" rx="3" className="spot__solid" />
      <rect x="72" y="26" width="14" height="42" rx="3" className="spot__accent" />
    </g>
  );
}

/**
 * الاسم → الرسمة.
 *
 * جدول بدل سلسلة `? :` — كانت خمس حالات وبقت اتناشر، والسلسلة على اتناشر
 * بتبقى سطر واحد مالوش آخر، وأسهل حاجة فيها إن واحدة تقع في الآخر كـ
 * fallback من غير ما حد ياخد باله. الجدول بيخلّي التايب سكريبت يرفض اسم
 * مالوش رسمة.
 */
const SPOTS: Record<SpotName, () => ReactElement> = {
  courses: Courses,
  exams: Exams,
  scores: Scores,
  topics: Topics,
  preparing: Preparing,
  payments: Payments,
  transfers: Transfers,
  orders: Orders,
  homework: Homework,
  codes: Codes,
  people: People,
  inbox: Inbox,
};

/** ورقة فيها مبلغ وعليها ختم — «مفيش طلبات اشتراك دلوقتي». */
function Payments() {
  return (
    <g>
      <rect x="30" y="22" width="48" height="44" rx="4" className="spot__solid" />
      <path d="M38 34 h24 M38 43 h18" className="spot__mark" />
      {/* الجنيه: دايرة عنبري وعليها علامة — العنصر الحي الوحيد. */}
      <circle cx="80" cy="54" r="12" className="spot__accent-fill" />
      <path d="M76 60 h9 M77 48 v11 M74 54 h8" className="spot__accent-glyph" />
    </g>
  );
}

/** سهم داخل صندوق — «مفيش تحويلات واردة». */
function Transfers() {
  return (
    <g>
      <rect x="26" y="40" width="68" height="26" rx="4" className="spot__solid" />
      <path d="M36 52 h20 M36 58 h12" className="spot__mark" />
      {/* السهم نازل جوّه الصندوق: «جاي لك»، مش «رايح». */}
      <circle cx="78" cy="34" r="13" className="spot__accent-fill" />
      <path d="M78 27 v13 M72 34 l6 6 l6 -6" className="spot__accent-glyph" />
    </g>
  );
}

/** كرتونة مقفولة — «مفيش طلبات كتب». */
function Orders() {
  return (
    <g>
      <rect x="30" y="36" width="60" height="30" rx="3" className="spot__solid" />
      {/* الشريط اللاصق في النص، وهو اللي بيخلّي المستطيل يقرا كعلبة. */}
      <path d="M60 36 v30" className="spot__mark" />
      <rect x="30" y="26" width="60" height="12" rx="3" className="spot__line" />
      <circle cx="84" cy="30" r="8" className="spot__accent-fill" />
    </g>
  );
}

/** ورقة وقلم — «مفيش واجبات مستنية تصحيح». */
function Homework() {
  return (
    <g>
      <rect x="28" y="22" width="44" height="44" rx="4" className="spot__solid" />
      <path d="M36 34 h26 M36 43 h20 M36 52 h23" className="spot__mark" />
      {/* القلم مايل على حرف الورقة. */}
      <path d="M72 56 l18 -18 l6 6 l-18 18 l-8 2 z" className="spot__accent" />
    </g>
  );
}

/** تذكرة مقصوصة — «مفيش أكواد». */
function Codes() {
  return (
    <g>
      <rect x="26" y="34" width="68" height="28" rx="5" className="spot__accent" />
      {/* القصّتين على الجنبين هُمّ اللي بيقولوا «تذكرة» مش «مستطيل». */}
      <circle cx="26" cy="48" r="5" className="spot__ground-fill" />
      <circle cx="94" cy="48" r="5" className="spot__ground-fill" />
      <path d="M60 38 v20" className="spot__mark" />
      <path d="M36 48 h14" className="spot__mark" />
    </g>
  );
}

/** راسين — «مفيش طلبة في النتيجة دي». */
function People() {
  return (
    <g>
      <circle cx="46" cy="36" r="10" className="spot__solid" />
      <path d="M30 64 a16 16 0 0 1 32 0 z" className="spot__solid" />
      <circle cx="76" cy="40" r="8" className="spot__accent" />
      <path d="M64 64 a12 12 0 0 1 24 0 z" className="spot__accent" />
    </g>
  );
}

/** ظرف مفتوح — «مفيش رسايل». */
function Inbox() {
  return (
    <g>
      <rect x="28" y="30" width="64" height="36" rx="4" className="spot__solid" />
      {/* الطيّة: خطين من الحرفين لوسط الظرف. */}
      <path d="M28 34 l32 20 l32 -20" className="spot__mark" />
      <circle cx="84" cy="30" r="9" className="spot__accent-fill" />
    </g>
  );
}
