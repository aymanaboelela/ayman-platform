import { MessageCircleQuestion, Users } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import type { BookShippingRates } from '@ayman/contracts/books';
import { waMeHref } from '@ayman/contracts/whatsapp';
import { BookOrderButton } from '@/components/site/book-order-button';

const c = copy.player;

export interface CourseSideLinksProps {
  /** This course's cohort group — `null` renders no row. */
  groupUrl: string | null;
  /** `contact.whatsapp`, E.164 — the DM to him. `null` renders no row. */
  whatsapp: string | null;
  /** «اطلب الكتاب» — `null` when the course sells no book on this surface. */
  book: {
    courseId: string;
    bookTitle: string;
    bookPriceCents: number;
    shippingRates: BookShippingRates;
    instapay: string | null;
    vodafoneCash: string | null;
  } | null;
}

/**
 * «جروب الدفعة» · «مساعدة» · «اطلب الكتاب» — one short strip at the foot of
 * the outline, each a link row of its own.
 *
 * These were two full cards under the outline (`CourseQuickLinks`, with a
 * fold-away switch) and a wide secondary button in the outline's HEAD. Three
 * things to press that are not the lecture, taking a third of the sidebar on
 * the page where the lesson list is what the student scrolls — «المنصة
 * للطالب زحمة أوي». A row of three small links says the same three things.
 *
 * Each row disappears on its own when its setting is unset — falling back to
 * anything else is the bug `WhatsappChannelCard`'s note records — and the
 * whole strip when all three are.
 */
export function CourseSideLinks({ groupUrl, whatsapp, book }: CourseSideLinksProps) {
  const helpHref = waMeHref(whatsapp);
  if (!groupUrl && !helpHref && !book) return null;

  return (
    <div className="outline__foot">
      {groupUrl ? (
        /* `target="_blank"`: a student mid-lecture must not lose the player to
           open a chat. */
        <a href={groupUrl} target="_blank" rel="noopener noreferrer" className="side-link">
          <Users className="size-4" aria-hidden="true" />
          {c.group.title}
        </a>
      ) : null}
      {helpHref ? (
        <a href={helpHref} target="_blank" rel="noopener noreferrer" className="side-link">
          <MessageCircleQuestion className="size-4" aria-hidden="true" />
          {c.sideLinks.help}
        </a>
      ) : null}
      {book ? <BookOrderButton {...book} compact /> : null}
    </div>
  );
}
