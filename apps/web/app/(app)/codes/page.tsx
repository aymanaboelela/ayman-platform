import Link from 'next/link';
import { History, KeyRound, MessageCircle, Sparkles } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { MyUnlockCodesSchema, type MyUnlockCodes } from '@ayman/contracts/unlock-codes';
import { waMeHref } from '@ayman/contracts/whatsapp';
import { cn } from '@ayman/ui/lib/cn';
import { KIND_ICON } from '@/components/unlock-codes/kind-icons';
import { RedeemForm } from '@/components/unlock-codes/redeem-form';
import { UnlockArt } from '@/components/unlock-codes/unlock-art';
import { apiGetAuthed } from '@/lib/api-server';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import '@/components/unlock-codes/unlock-codes.css';

const c = copy.unlockCodes;

export const metadata = { title: c.pageTitle };

const DATE = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * «كود الكورس» — where a code bought on WhatsApp is typed in.
 *
 * The form is the page. Everything else answers the two questions a student
 * standing here has: «الكود ده بيجي منين؟» (the steps, and the WhatsApp card
 * that starts them) and «أنا فتحت إيه قبل كده؟» (the history — a student who
 * typed a code last week and cannot find the lecture comes here first).
 *
 * The history read fails QUIETLY into an empty list: a student with a code in
 * hand must always be able to type it, even when the list above cannot load.
 */
export default async function UnlockCodesPage() {
  const [mine, { contact }] = await Promise.all([
    apiGetAuthed('/api/me/unlock-codes', MyUnlockCodesSchema).catch(
      (): MyUnlockCodes => ({ items: [] }),
    ),
    getPublicSettingsOrDefaults(),
  ]);

  const wa = waMeHref(contact.whatsapp);
  const waHref = wa ? `${wa}?text=${encodeURIComponent(c.whatsappMessage)}` : null;

  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <section className="uc-hero">
        <div>
          <span className="uc-hero__pill">
            <Sparkles className="size-4" aria-hidden="true" />
            {c.eyebrow}
          </span>
          <h1 className="uc-hero__title">{c.title}</h1>
          <p className="uc-hero__lead">{c.lead}</p>
        </div>
        <UnlockArt className="uc-hero__art" />
      </section>

      <div className="uc-lift relative mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <section className="uc-card" aria-labelledby="uc-form-title">
          <div className="uc-card__head">
            <span className="uc-card__icon" aria-hidden="true">
              <KeyRound className="size-6" />
            </span>
            <div className="min-w-0">
              <h2 id="uc-form-title" className="uc-card__title">
                {c.inputLabel}
              </h2>
              <p className="uc-card__lead">{c.cardLead}</p>
            </div>
          </div>
          <RedeemForm />
        </section>

        <aside className="grid gap-4">
          <section className="uc-card" aria-labelledby="uc-steps-title">
            <h2 id="uc-steps-title" className="uc-card__title">
              {c.stepsTitle}
            </h2>
            <ol className="uc-steps">
              {c.steps.map((step, index) => (
                <li key={step} className="uc-step">
                  <span className="uc-step__n tabular">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Nothing to link to without a number — the card disappears rather
              than opening WhatsApp's own marketing page. */}
          {waHref ? (
            <section className="uc-wa" aria-labelledby="uc-wa-title">
              <h2 id="uc-wa-title" className="uc-wa__title">
                {c.buyTitle}
              </h2>
              <p className="uc-wa__body">{c.buyBody}</p>
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="uc-wa__btn">
                <MessageCircle className="size-5" aria-hidden="true" />
                {c.buyCta}
              </a>
            </section>
          ) : null}
        </aside>
      </div>

      <section className="mt-10" aria-labelledby="uc-history-title">
        <h2
          id="uc-history-title"
          className="flex items-center gap-2 text-[length:var(--fs-title-3)] font-semibold text-fg"
        >
          <History className="size-5 text-accent-text" aria-hidden="true" />
          {c.historyTitle}
        </h2>

        {mine.items.length === 0 ? (
          <p className="uc-empty">
            <KeyRound className="size-5 shrink-0" aria-hidden="true" />
            {c.historyEmpty}
          </p>
        ) : (
          <ul className="uc-history">
            {mine.items.map((item) => {
              const first = item.opened.find((opened) => opened.lessonId !== null);
              return (
                <li key={item.code} className={cn('uc-ticket', item.revoked && 'is-revoked')}>
                  <div className="uc-ticket__top">
                    <div className="min-w-0">
                      <p className="uc-ticket__course">{item.course.title}</p>
                      <p className="uc-ticket__date">
                        {formatCopy(c.historyOn, { date: DATE.format(new Date(item.redeemedAt)) })}
                      </p>
                    </div>
                    <span className="uc-ticket__code">{item.code}</span>
                  </div>

                  <div className="uc-chips">
                    {item.opened.map((opened, index) => {
                      const Icon = KIND_ICON[opened.kind];
                      return (
                        <span key={`${opened.kind}-${index}`} className={`uc-chip uc-chip--${opened.kind}`}>
                          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {opened.kind === 'course' ? c.kind.course : `${c.kind[opened.kind]}: ${opened.title}`}
                          </span>
                        </span>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    {item.revoked ? (
                      <span className="uc-badge uc-badge--off">{c.historyRevoked}</span>
                    ) : (
                      <span className="uc-badge uc-badge--ok">{c.successBadge}</span>
                    )}
                    {!item.revoked && first?.lessonId ? (
                      <Link
                        href={`/courses/${encodeURIComponent(item.course.slug)}/lessons/${first.lessonId}`}
                        className="chip chip--solid"
                      >
                        {c.open}
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
