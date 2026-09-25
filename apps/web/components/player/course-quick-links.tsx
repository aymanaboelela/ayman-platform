'use client';

import { useSyncExternalStore } from 'react';
import { ArrowLeft, ChevronDown, MessageCircleQuestion, Users } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { waMeHref } from '@ayman/contracts/whatsapp';
import './player-cards.css';

const c = copy.player;

/**
 * «جروب الدفعة» and «تحتاج مساعدة؟», side by side under the outline, with a
 * switch that folds them away.
 *
 * They used to be two full cards stacked one over the other — an icon tile, a
 * two-line lead and a full-width button each — about 330px of sidebar for two
 * links, on the page where the outline is what the student came to scroll.
 * «كبار أوي… يبقوا جنب بعض، ويبقى فيه زرار يخفيهم ويرجّعهم.»
 *
 * Each tile IS the link now: one tap target, no button inside a card.
 *
 * ## The two destinations are still not the same thing
 *
 * `whatsappGroupUrl` is this course's cohort; `contact.whatsapp` is a DM to him
 * via `waMeHref`. Each tile disappears on its own when its setting is unset —
 * falling back to anything else is the bug `WhatsappChannelCard`'s note
 * records — and the whole block when both are.
 */
export function CourseQuickLinks({
  groupUrl,
  whatsapp,
}: {
  groupUrl: string | null;
  whatsapp: string | null;
}) {
  const helpHref = waMeHref(whatsapp);
  const hidden = useQuickLinksHidden();

  if (!groupUrl && !helpHref) return null;

  return (
    <section className="ql" aria-label={c.quickLinks.title} data-hidden={hidden ? '' : undefined}>
      <div className="ql__bar">
        <span className="ql__title">{c.quickLinks.title}</span>
        <button
          type="button"
          className="ql__toggle"
          aria-expanded={!hidden}
          aria-controls="course-quick-links"
          onClick={() => setQuickLinksHidden(!hidden)}
        >
          {hidden ? c.quickLinks.show : c.quickLinks.hide}
          <ChevronDown className="ql__chevron size-4" aria-hidden="true" />
        </button>
      </div>

      {hidden ? null : (
        <div id="course-quick-links" className="ql__grid" data-count={groupUrl && helpHref ? 2 : 1}>
          {groupUrl ? (
            /* `target="_blank"`: a student mid-lecture must not lose the player
               to open a chat. */
            <a href={groupUrl} target="_blank" rel="noopener noreferrer" className="ql__tile ql__tile--group">
              <span className="ql__icon" aria-hidden="true">
                <Users className="size-[18px]" />
              </span>
              <span className="ql__text">
                <span className="ql__name">{c.group.title}</span>
                <span className="ql__sub">{c.group.short}</span>
              </span>
              <ArrowLeft className="ql__go size-4" aria-hidden="true" />
            </a>
          ) : null}

          {helpHref ? (
            <a href={helpHref} target="_blank" rel="noopener noreferrer" className="ql__tile ql__tile--help">
              <span className="ql__icon" aria-hidden="true">
                <MessageCircleQuestion className="size-[18px]" />
              </span>
              <span className="ql__text">
                <span className="ql__name">{c.help.title}</span>
                <span className="ql__sub">{c.quickLinks.helpShort}</span>
              </span>
              <ArrowLeft className="ql__go size-4" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      )}
    </section>
  );
}

/*
 * «مخفيين» survives a lesson change and a reload — folding them away once has
 * to mean once, not once per lecture. Per device, in `localStorage`, which can
 * throw (a private window, blocked site data); every read and write is wrapped
 * and the cards simply show.
 *
 * `useSyncExternalStore` rather than a state read in an effect: the server
 * render and the first client render agree on «shown», and the stored answer
 * lands without a cascading render (the lint rule this codebase runs refuses
 * `setState` in an effect on sight).
 */
const STORAGE_KEY = 'player:quick-links-hidden';
const EVENT = 'player:quick-links';

/** The answer for this page view when storage refuses to keep one. */
let fallback = false;

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return fallback;
  }
}

function setQuickLinksHidden(next: boolean) {
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, '1');
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    fallback = next;
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function useQuickLinksHidden(): boolean {
  return useSyncExternalStore(
    subscribe,
    readHidden,
    () => false,
  );
}
