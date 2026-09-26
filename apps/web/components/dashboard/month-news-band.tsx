import Link from 'next/link';
import { CalendarPlus, Clock, PlayCircle, Sparkles } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { DashboardMonthOffer } from '@ayman/contracts/progress';
import { formatEGP } from '@/lib/price';

const c = copy.dashboard.monthNews;

/**
 * «شهر جديد اتفتح» — الشريط اللي بيقول للطالب الدافع بالشهر إن فيه شهر تاني
 * اتفتح، من غير ما يدخل الكورس يلاقيه.
 *
 * ## الطلب اللي ده جوابه
 *
 * «لما يتفتح شهر جديد، الطالب يعرف من فوق الداشبورد إنه يقدر يشترك فيه». الباب
 * كان موجود — `MonthOfferCard` جوّه الكورس وفي المكتبة — بس كان محتاج إنه يفتح
 * الكورس الأول عشان يشوفه، وده بالظبط اللي مايحصلش لطالب مستنّي محاضرة تنزل.
 *
 * ## اللي مايشوفهوش، وده نص الفيتشر
 *
 * الـAPI بيقرّر، مش الكومبوننت: اللي اشترك ترم أو سنة أو «٣ شهور» مايشوفهوش
 * خالص، واللي مادفعش بالشهر أصلًا كمان. الشرط الكامل وسببه في
 * `DashboardMonthOfferSchema`، ومكتوب مرة واحدة هناك عشان الكارت والشريط
 * مايختلفوش.
 *
 * ## اللون، وقاعدة «فعل واحد على الشاشة»
 *
 * الشريط على `--e-tint` — إمبر، يعني **بنية**، زي `.exam-band` و`.dash-hero`
 * فوقه بالظبط، بس واش خفيف مش ستيدج كامل: تالت باند بنفس الأرضية كان هيقرا
 * كإعلان. والأمبر (`--a-9`) على الزرار بس، ودي القاعدة اللي `study.css`
 * بيقولها بالحرف: الأمبر هو اللي بيتدوس.
 *
 * و`quiet` هو اللي بيحفظ «فعل واحد»: لما يكون فيه امتحان شهر **مفتوح**، الصفحة
 * بتوقّف `<NextUpBlock>` لأن الأمبر بقى على «ادخل الامتحان» — فالشريط ده بيسيب
 * الأمبر كمان ويبقى لينك هادي. الشهر مش بيقفل الساعة ٨، الامتحان بيقفل.
 */
export function MonthNewsBand({
  offers,
  quiet = false,
}: {
  offers: readonly DashboardMonthOffer[];
  quiet?: boolean;
}) {
  if (offers.length === 0) return null;

  return (
    <section className="month-news mb-6" aria-labelledby="month-news-title">
      <p className="month-news__eyebrow">
        <Sparkles className="size-3.5" aria-hidden="true" />
        {c.eyebrow}
      </p>
      <h2 className="month-news__title" id="month-news-title">
        {offers.length === 1 ? titleOf(offers[0]!) : c.titleMany}
      </h2>
      <p className="month-news__lead">{c.lead}</p>

      <ul className="month-news__list">
        {offers.map((offer) => (
          <MonthNewsRow key={offer.courseId} offer={offer} quiet={quiet} />
        ))}
      </ul>
    </section>
  );
}

/**
 * صف الكورس الواحد.
 *
 * الزرار بيشيل **كل** الشهور المفتوحة اللي مش معاه في الـquery (`?month=a,b`)،
 * وصفحة الاشتراك بتفتح على خطوة الشهور وهُمّ متحدّدين — فالتغيير بيحصل هناك،
 * جوّه الشيك أوت اللي شايف السعر النهائي. مفيش تجليخ هنا، وعشان كده الشريط ده
 * سيرفر كومبوننت من غير أي جافاسكريبت؛ الـtoggles اللي في `MonthOfferCard`
 * مكانها الصح جوّه الكورس، مش في إشعار فوق الصفحة.
 */
function MonthNewsRow({ offer, quiet }: { offer: DashboardMonthOffer; quiet: boolean }) {
  const total = offer.months.reduce((sum, month) => sum + month.priceCents, 0);
  const href = `/courses/${encodeURIComponent(offer.courseSlug)}/subscribe?month=${offer.months
    .map((month) => encodeURIComponent(month.id))
    .join(',')}`;
  const many = offer.months.length > 1;

  return (
    <li className="month-news__row">
      <div className="month-news__what">
        <span className="month-news__course">
          {formatCopy(c.course, { course: offer.courseTitle })}
        </span>
        <span className="month-news__months">
          {offer.months.map((month) => (
            <span key={month.id} className="month-news__month">
              <span className="month-news__month-name">{month.title}</span>
              <span className="month-news__month-meta">
                <PlayCircle className="size-3.5" aria-hidden="true" />
                {month.lessonCount > 0
                  ? formatCopy(c.lessons, { count: month.lessonCount })
                  : c.lessonsEmpty}
              </span>
            </span>
          ))}
        </span>
      </div>

      {offer.pending ? (
        /* طلب على الكورس ده مستنّي في المراجعة، والشيك أوت بيرفض التاني — فالصف
           بيقول الحالة بدل زرار آخره «قيد المراجعة». نفس اللي `MonthOfferCard`
           بيعمله بالحرف. */
        <p className="month-news__pending">
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          {c.pending}
        </p>
      ) : (
        <div className="month-news__act">
          <span className="month-news__total">{formatCopy(c.total, { price: formatEGP(total) })}</span>
          <Link href={href} className="month-news__cta" data-quiet={quiet ? '' : undefined}>
            <CalendarPlus className="size-[18px]" aria-hidden="true" />
            {many ? c.ctaMany : c.ctaOne}
          </Link>
        </div>
      )}
    </li>
  );
}

/** عنوان لكورس واحد: اسم الشهر لو واحد، وإلا الجملة العامة. الكورس نفسه مكتوب
 *  في الصف تحت، فمش بيتكرر هنا. */
function titleOf(offer: DashboardMonthOffer): string {
  return offer.months.length === 1
    ? formatCopy(c.titleOne, { month: offer.months[0]!.title })
    : c.titleMany;
}
