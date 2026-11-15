'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { copy } from '@ayman/contracts/copy';
import { ChevronForward } from './icons';

/**
 * «المحاضرة التالية» pinned to the bottom of a phone screen.
 *
 * On a desktop the next lecture is one row down in the rail. On a phone the
 * rail is a sheet behind a button, and the ONE thing a student does after a
 * video is go to the next one — so it has its own bar where the thumb already
 * is, in the strip `.shell main` keeps clear below `md` (the student tab bar
 * is hidden on this route; see `StudentTabBar`). Nothing renders on the last
 * lesson of a course.
 *
 * ## Portalled to `<body>`, and it has to be
 *
 * The page renders inside `.route-fade`, whose finished entrance animation
 * leaves `transform` computed as the identity matrix — and ANY transform makes
 * an element the containing block for every `position: fixed` descendant. Drawn
 * in place, this bar sat at the bottom of the PAGE, 900px below the fold on a
 * phone; measured at 390×844: `top: 937`. Same trap `student-shell.tsx`
 * documents for the assistant launcher, same fix: render it from `<body>`.
 *
 * `useSyncExternalStore` rather than a mounted flag in an effect: the server
 * and the hydrating render agree on «nothing», the body arrives without a
 * cascading state write, and the lint rule this codebase runs refuses
 * `setState` in an effect on sight.
 *
 * The link itself may land on a lecture the gate has not opened yet (this one
 * not finished): the server answers that with the library page, which
 * explains the lock — the same path the rail's «التالي» chip takes.
 */
export function NextLessonBar({
  courseSlug,
  next,
}: {
  courseSlug: string;
  next: { id: string; title: string };
}) {
  const host = useSyncExternalStore(
    () => () => {},
    () => document.body,
    () => null,
  );
  if (!host) return null;

  const c = copy.player.nextBar;
  return createPortal(
    <Link
      href={`/courses/${courseSlug}/lessons/${next.id}`}
      className="next-bar lg:hidden"
      aria-label={`${c.open} — ${next.title}`}
    >
      <span className="next-bar__text">
        <span className="next-bar__label">{c.label}</span>
        <span className="next-bar__title">{next.title}</span>
      </span>
      <span className="next-bar__go" aria-hidden="true">
        <ChevronForward />
      </span>
    </Link>,
    host,
  );
}
