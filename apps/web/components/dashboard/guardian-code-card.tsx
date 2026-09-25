'use client';

import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.dashboard.guardianCode;

/**
 * «كود ولي الأمر» — الكود اللي الطالب بيدّيه لأبوه عشان يتابعه.
 *
 * ## ليه الكود مكتوب بالكامل على الشاشة
 *
 * لأن ده شغله. الحاجات السرية التانية على المنصة بتتخبّى لأن صاحبها شايفها
 * خلاص؛ ده العكس — الطالب لازم يقراه بصوت عالي أو يبعته، وإخفاؤه ورا «اضغط
 * عشان تشوف» بيزوّد خطوة على الحاجة الوحيدة اللي الكارت موجود عشانها.
 *
 * ## ومكتوب `ltr` ومتباعد
 *
 * ٦ خانات لاتيني ورموز جوّه صفحة عربي بتتقلب من غير `dir="ltr"` — والكود المقلوب
 * كود تاني خالص. والتباعد (`tracking`) عشان اللي بيقرا من الشاشة ويكتب في
 * تليفون: ده الاستخدام الفعلي، والأبجدية نفسها اتشالت منها `0/O` و`1/I/L`
 * لنفس السبب.
 *
 * ## والزرار فيه طريقين
 *
 * `navigator.clipboard` بيفشل على http وفي بعض المتصفحات القديمة، والطالب
 * اللي بيدوس ومايحصلش حاجة مش هيعرف إن ده المتصفح. فيه `input` مخفي بيتحدّد
 * وبيتنسخ بالطريقة القديمة لو الأولى وقعت — نفس اللي `book-order-panel`
 * بيعمله بالحرف.
 */
export function GuardianCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const fallbackRef = useRef<HTMLInputElement>(null);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    } catch {
      // نكمّل على الطريق التاني تحت.
    }
    const input = fallbackRef.current;
    if (!input) return;
    input.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // مفيش طريق تالت — الكود مكتوب قدامه على أي حال.
    }
  }

  return (
    <section className="relative rounded-md border border-line-subtle bg-surface-2 p-4">
      <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{c.title}</h2>
      <p className="mt-1 max-w-[32rem] text-[length:var(--fs-text-sm)] text-fg-muted">{c.lead}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code
          dir="ltr"
          // ٦ خانات بس، فبقى كبير ومتباعد: بيتقري بصوت عالي أو بيتنقل بالعين.
          className="mono select-all rounded-sm border border-line bg-surface-1 px-4 py-2 text-[length:var(--fs-title-3)] font-semibold tracking-[0.3em] text-fg"
        >
          {code}
        </code>
        <button
          type="button"
          onClick={() => void copyCode()}
          className={cn('chip', copied && 'chip--solid')}
          aria-label={c.copy}
        >
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {copied ? c.copied : c.copy}
        </button>
      </div>

      {/* للطريق التاني في النسخ. `readOnly` مش `disabled` — العنصر المعطّل
          مابيتحدّدش، و`execCommand('copy')` بيشتغل على تحديد. */}
      <input
        ref={fallbackRef}
        readOnly
        value={code}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute size-px opacity-0"
      />

      <p className="mt-2 text-[length:var(--fs-text-xs)] text-fg-subtle">{c.warning}</p>
    </section>
  );
}
