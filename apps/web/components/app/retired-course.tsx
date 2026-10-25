'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { CheckCircle2, Route, Sparkles } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { RetiredCourses } from '@ayman/contracts/path';
import './retired-course.css';

const c = copy.retiredCourse;

/** Per-device memory of «تمام، فهمت» — a convenience, not state anyone else
 *  needs, so browser storage is right; every access is guarded because it can
 *  throw in a private window. */
const SEEN_KEY = 'retired-course-seen';

const SEEN_EVENT = 'retired-course-seen';

/** The raw stored string — a stable primitive, which is what
 *  `useSyncExternalStore` needs from a snapshot. */
function readRaw(): string {
  try {
    return window.localStorage.getItem(SEEN_KEY) ?? '[]';
  } catch {
    return '[]';
  }
}

function parseSeen(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(SEEN_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(SEEN_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function markSeen(ids: readonly string[]): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...parseSeen(readRaw()), ...ids])]));
  } catch {
    // Nothing to do: the card simply comes back next visit.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/**
 * «حسابي»'s card for a course the instructor archived. One card for all of
 * them (normally one), dismissed with «تمام، فهمت» and not shown again on this
 * device. The server snapshot is `null`, so the HTML renders nothing and the
 * card appears after hydration — server and client never disagree about what
 * storage says.
 */
export function RetiredCourseNotice({ retired }: { retired: RetiredCourses['courses'] }) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  if (raw === null) return null;

  const seen = new Set(parseSeen(raw));
  const visible = retired.filter((course) => !seen.has(course.id));
  if (visible.length === 0) return null;

  return (
    <RetiredCard
      title={formatCopy(c.title, { course: visible.map((course) => course.title).join('، ') })}
      onDismiss={() => markSeen(visible.map((course) => course.id))}
    />
  );
}

/** The same object, page-sized — `/library/:slug` of an archived course. */
export function RetiredCoursePage() {
  return <RetiredCard title={c.pageTitle} page />;
}

function RetiredCard({ title, page = false, onDismiss }: { title: string; page?: boolean; onDismiss?: () => void }) {
  return (
    <section className={page ? 'retired retired--page' : 'retired mb-8'} aria-labelledby="retired-title">
      <span className="retired__mark" aria-hidden="true">
        <Sparkles className="size-8" />
      </span>
      <div className="min-w-0">
        <p className="retired__eyebrow">{c.eyebrow}</p>
        {page ? (
          <h1 id="retired-title" className="retired__title">
            {title}
          </h1>
        ) : (
          <h2 id="retired-title" className="retired__title">
            {title}
          </h2>
        )}
        <p className="retired__body">
          {c.body} {c.kept}
        </p>
        <ul className="retired__points">
          {c.points.map((point) => (
            <li key={point} className="retired__point">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {point}
            </li>
          ))}
        </ul>
        <div className="retired__actions">
          <Link href="/path" className="retired__btn retired__btn--primary">
            <Route className="size-4" aria-hidden="true" />
            {c.cta}
          </Link>
          {onDismiss ? (
            <button type="button" className="retired__btn retired__btn--ghost" onClick={onDismiss}>
              {c.dismiss}
            </button>
          ) : (
            <Link href="/library" className="retired__btn retired__btn--ghost">
              {c.secondary}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
