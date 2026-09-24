import { MessageCircle, Ticket } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { waMeHref } from '@ayman/contracts/whatsapp';
import { RedeemForm } from './redeem-form';
import './unlock-codes.css';

const c = copy.unlockCodes;

/**
 * «عندك كود؟» on a course's own page — the same form as `/codes`, compact, so
 * a student who got a code for THIS course types it where they are rather
 * than hunting for the right screen. The WhatsApp line under it is the other
 * half of the promise: «محاضرة واحدة بس؟» is answered on the page it is asked.
 */
export function RedeemCard({ whatsapp, courseTitle }: { whatsapp: string | null; courseTitle: string }) {
  const wa = waMeHref(whatsapp);
  const href = wa
    ? `${wa}?text=${encodeURIComponent(formatCopy(c.whatsappMessageCourse, { course: courseTitle }))}`
    : null;

  return (
    <section className="uc-mini" aria-labelledby="uc-mini-title">
      <div className="uc-card__head">
        <span className="uc-card__icon" aria-hidden="true">
          <Ticket className="size-6" />
        </span>
        <div className="min-w-0">
          <h2 id="uc-mini-title" className="uc-card__title">
            {c.cardTitle}
          </h2>
          <p className="uc-card__lead">{c.cardLead}</p>
        </div>
      </div>

      <RedeemForm compact />

      {href ? (
        <p className="uc-mini__single">
          <span>{c.cardSingle}</span>
          <a href={href} target="_blank" rel="noopener noreferrer" className="uc-mini__wa">
            <MessageCircle className="size-4" aria-hidden="true" />
            {c.buyCta}
          </a>
        </p>
      ) : null}
    </section>
  );
}
