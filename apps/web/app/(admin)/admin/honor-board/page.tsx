import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, Trophy } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { copy as siteCopy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { AdminHonorBoardSchema } from '@ayman/contracts/admin/honor-board';
import { cn } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { HonorPinDialog } from './honor-pin-dialog';
import { HonorPinActions } from './honor-pin-actions';
import { HonorExamActions } from './honor-exam-actions';
import { HonorFaceThumb } from './honor-face-thumb';

const c = copy.admin.honorBoard;

export const metadata = { title: c.title };

/**
 * `/admin/honor-board` — مين على لوحة الشرف، ومين هيتحط عليها.
 *
 * ## ليه الشاشة دي موجودة
 *
 * اللوحة كانت بتتملا من شاشة التصحيح بس: تفتح ورقة اتصحّحت، تدوس «حطه في
 * لوحة الشرف». يعني عشان تكرّم حد لازم يكون امتحن، ولازم تلاقي ورقته. اللي
 * اتطلب: تدوّر عليه بالاسم، تحط تاريخ ومركز وصورة، خلاص.
 *
 * ## بتعرض المصدرين، وبتحرّر واحد
 *
 * كل دور فيه قسمين: «متحطّين بالإيد» (بيتعدّلوا ويتمسحوا من هنا) و«من
 * امتحانات مثبّتة» (للعرض، وبيتفكوا من شاشة التصحيح). لو الشاشة عرضت اليدوي
 * بس، المدرّس كان هيبص على «لوحة الشرف» ويلاقي نص اللي على موقعه ناقص —
 * وهيفتكر إنه ضاع.
 *
 * تكرار زرار الفك هنا كان هيبقى طريقتين لنفس الحاجة على شاشتين، فبدلها فيه
 * لينك بيودّي على الورقة نفسها.
 *
 * ## بتـ404 لما الفيتشر مقفولة
 *
 * زي `(site)/honor-board/page.tsx` بالحرف: الشاشة دي مش «ممنوعة» على ستاك
 * مالوش لوحة، هي مش موجودة عنده أصلاً — والراوت ورا `@RequireFeature` كمان،
 * فزرار الحفظ كان هيرد ٤٠٤ بعد ما الفورم يتملا.
 */
export default async function AdminHonorBoardPage() {
  if (!(await getEntitlements()).honorBoard) notFound();

  const board = await adminGet('/api/admin/honor-board', AdminHonorBoardSchema);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[length:var(--fs-title-2)] font-semibold text-fg">
            <Trophy className="size-6 text-accent" strokeWidth={1.5} aria-hidden="true" />
            {c.title}
          </h1>
          <p className="mt-1 max-w-2xl text-[length:var(--fs-text-sm)] text-fg-muted">{c.lead}</p>
        </div>
        <HonorPinDialog pin={null} courses={board.courses} />
      </header>

      {board.rounds.length === 0 ? (
        <p className="rounded-[var(--r-lg)] border border-dashed border-line p-8 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.empty}
        </p>
      ) : (
        <div className="space-y-5">
          {board.rounds.map((round) => {
            const count = round.manual.length + round.fromExams.length;
            return (
              <section
                key={round.key}
                className="overflow-hidden rounded-[var(--r-lg)] border border-line bg-surface"
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <div className="min-w-0">
                    {/* التاريخ بأرقام غربية — نفس قاعدة كل تاريخ على المنصة
                        (`ar-EG-u-nu-latn`)، والسنة مهمة هنا زي الأرشيف. */}
                    <h2 className="text-[length:var(--fs-text-base)] font-semibold text-fg">
                      {dateFormatter.format(new Date(round.pinnedAt))}
                    </h2>
                    <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
                      {formatCopy(c.roundCount, { n: count })}
                    </p>
                  </div>
                  {/* بيفتح الصفحة العامة على **الدور ده** — `?round=` — مش على
                      أول الأرشيف، عشان اللي بيراجع يشوف نفس اللوحة. */}
                  <Link
                    href={`/honor-board?round=${round.key}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-accent-text hover:underline"
                  >
                    {c.viewPublic}
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </Link>
                </header>

                {round.manual.length > 0 ? (
                  <div className="px-4 py-3">
                    <h3 className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-fg-muted">
                      {c.manualTitle}
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {round.manual.map((pin) => (
                        <li
                          key={pin.id}
                          className={cn(
                            'flex flex-wrap items-center gap-3 rounded-md border border-line',
                            'bg-[color-mix(in_oklch,var(--a-9),var(--n-2)_94%)] p-3',
                          )}
                        >
                          <HonorFaceThumb
                            name={pin.studentName}
                            photoKey={pin.photoKey ?? pin.profilePhotoKey}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[length:var(--fs-text-base)] font-semibold text-fg">
                              {pin.studentName}
                            </p>
                            {/* بيلف مش بيتقص: على الموبايل «المركز الأول ·
                                الأولى على الدفعة في امتحان سبتمبر» كان بيوصل
                                لـ«المركز الأول · الأو…»، وهو السطر اللي
                                بيقول ليه الاسم على اللوحة أصلًا. */}
                            <p className="line-clamp-2 text-[length:var(--fs-text-sm)] text-fg-muted">
                              {rankWord(pin.rank)}
                              {' · '}
                              {pin.reason}
                            </p>
                            {/* الشارة، أو الجملة اللي بتقول إن مفيش — كارت من
                                غير شارة حاجة يعرفها قبل ما يفتح الموقع. */}
                            <p className="truncate text-[length:var(--fs-text-sm)] text-fg-subtle">
                              {pin.courseLabel || c.noCourse}
                              {pin.phone ? ` · ${pin.phone}` : ''}
                            </p>
                          </div>
                          {/* زرارين على كل صف، مش قايمة مخفية: ده اللي
                              اتطلب بالنص على كل شاشة إدارة هنا.

                              `w-full` على الموبايل عشان ينزلوا سطر لوحدهم —
                              جنب الاسم كانوا بياخدوا نص العرض، فالاسم نفسه
                              كان بيتقص لـ«مريم عبد الرح…». */}
                          <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                            <HonorPinDialog pin={pin} courses={board.courses} />
                            <HonorPinActions id={pin.id} name={pin.studentName} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {round.fromExams.length > 0 ? (
                  <div className="border-t border-line px-4 py-3">
                    <h3 className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-fg-muted">
                      {c.examTitle}
                    </h3>
                    <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-subtle">
                      {c.examHint}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {round.fromExams.map((row) => (
                        <li
                          key={row.attemptId}
                          className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3"
                        >
                          <HonorFaceThumb name={row.studentName} photoKey={row.photoKey} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[length:var(--fs-text-base)] font-semibold text-fg">
                              {row.studentName}
                            </p>
                            <p className="truncate text-[length:var(--fs-text-sm)] text-fg-muted">
                              {rankWord(row.rank)}
                              {' · '}
                              {row.title}
                            </p>
                            <p className="truncate text-[length:var(--fs-text-sm)] text-fg-subtle">
                              {row.courseLabel}
                              {/* الدرجة بأرقام غربية جوّه سطر عربي، معزولة
                                  بـ`dir="ltr"` — من غيرها «47/50» بتتقلب
                                  لـ«50/47»، ودي درجة تانية خالص. */}
                              {row.scaledScore !== null && row.gradeOutOf !== null ? (
                                <>
                                  {' · '}
                                  <span dir="ltr" className="inline-block">
                                    {row.scaledScore}/{row.gradeOutOf}
                                  </span>
                                </>
                              ) : null}
                            </p>
                          </div>
                          <Link
                            href={`/admin/grading/${row.attemptId}`}
                            className="shrink-0 text-[length:var(--fs-text-sm)] text-accent-text hover:underline"
                          >
                            {c.examOpen}
                          </Link>
                          {/* الصفوف دي كانت الوحيدة على الشاشة اللي مالهاش
                              زرار غير «افتح الورقة»، والرسالة فوقها بتقول
                              «بيتشالوا من شاشة تصحيح الورق» — يعني بتوصّف
                              رحلة مش بتدّي مخرج. واللي بيبص على اللوحة هنا
                              هو نفسه اللي عايز يشيل اسم منها. */}
                          <HonorExamActions
                            attemptId={row.attemptId}
                            name={row.studentName}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** «المركز الأول» — الكلمة، مش الرقم: نفس الكلمة اللي بتتطبع على الكارت
 *  العام بالظبط، عشان الشاشة تعرض اللي هينزل مش وصف ليه. */
function rankWord(rank: number): string {
  return siteCopy.landing.honorBoard.placeRanks[rank - 1] ?? '';
}

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'Africa/Cairo',
});
