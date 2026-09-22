import Link from 'next/link';
import { ArrowLeft, Trophy } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { HonorStanding } from '@ayman/contracts';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.dashboard.honorBoard;

/**
 * «مبروك! اسمك على لوحة الشرف» — على شاشة الطالب نفسه.
 *
 * ## ليه الكارت ده موجود أصلاً
 *
 * اللوحة صفحة **عامة**، والطالب مالوش سبب يفتحها. من غير الكارت ده والإشعار
 * اللي معاه، المدرّس بيحط اسم واحدة على الصفحة الرئيسية وهي مش عارفة — وده
 * بيلغي نص الفيتشر: الاسم بيتحط عشان صاحبه يفرح بيه، مش عشان الأرشيف.
 *
 * ## بيروح على الدور، مش على أول الصفحة
 *
 * `/honor-board?round=<day>` — اللوحة بتتغيّر كل امتحان، وبعد شهر اللي الكارت
 * بيتكلّم عنه بيبقى في دور تحت. الرابط بيفتح نفس اللوحة اللي اتحط عليها.
 *
 * ## بيختفي لوحده
 *
 * السيرفر مابيبعتش غير تكريم عمره أقل من أسبوعين (`honorStandingFor`). كارت
 * «مبروك» دايم بيبقى أثاث، والأثاث مابيتشافش — فلما ييجي تكريم تاني، الكارت
 * بيبقى خبر تاني مش نفس الخبر القديم.
 *
 * ## سيرفر كومبوننت
 *
 * مفيش ستيت ولا إيفيكت: البيانات جاية مع حمولة الداشبورد اللي الصفحة بتقراها
 * أصلاً، فالكارت مابيكلّفش ريكويست ولا كيلوبايت جافاسكريبت.
 */
export function HonorBoardCard({ standing }: { standing: HonorStanding }) {
  const rank = copy.landing.honorBoard.placeRanks[standing.rank - 1] ?? '';

  return (
    <section
      className={cn(
        'mb-6 overflow-hidden rounded-[var(--r-lg)] border border-accent/35',
        'bg-[color-mix(in_oklch,var(--a-9),var(--n-2)_92%)]',
      )}
    >
      <div className="flex items-start gap-3 p-4 sm:p-5">
        {/* نفس الكأس اللي في عنوان القسم على الصفحة الرئيسية — الكارت اللي
            بيودّي على اللوحة لازم يبقى شكله اللوحة. */}
        <span
          className={cn(
            'mt-0.5 grid size-11 shrink-0 place-items-center rounded-full',
            'bg-accent/15 text-accent-text',
          )}
          aria-hidden="true"
        >
          <Trophy className="size-5" strokeWidth={1.5} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
            {c.eyebrow}
          </p>
          <p className="mt-0.5 text-[length:var(--fs-text-base)] font-semibold text-fg">
            {c.title}
          </p>

          {/*
            «المركز الأول — الأول على الدفعة».

            الكلمة مش الرقم: رقم لاتيني جوّه سطر عربي بيتقلب من غير
            `unicode-bidi: isolate`، والكلمة بتتقري صح في كل مكان من غير
            ستايل إضافي.
          */}
          <p className="mt-2 text-[length:var(--fs-text-sm)] leading-[1.75] text-fg">
            {formatCopy(c.reason, { rank, reason: standing.reason })}
          </p>

          {/* الشارة — «تانية بكالوريا — لغات». بتختفي لما مايكونش فيه كورس
              ولا سنة في البروفايل، بدل ما يفضل سطر فاضي مكانها. */}
          {standing.courseLabel ? (
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
              {standing.courseLabel}
            </p>
          ) : null}

          <Link
            href={`/honor-board?round=${standing.day}`}
            className={cn(
              'mt-3.5 inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4',
              'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
              'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
            )}
          >
            {c.open}
            {/* `ArrowLeft` — الصفحة RTL، و«قدّام» ناحية الشمال. */}
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
