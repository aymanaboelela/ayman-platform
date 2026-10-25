'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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

function readSeen(): string[] {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeSeen(ids: string[]): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    // Nothing to do: the card simply comes back next visit.
  }
}

/**
 * «حسابي»'s card for a course the instructor archived. One card for all of
 * them (normally one), dismissed with «تمام، فهمت» and not shown again on this
 * device. Rendered only after mount so the server HTML never disagrees with
 * what storage says.
 */
export function RetiredCourseNotice({ retired }: { retired: RetiredCourses['courses'] }) {
  const [visible, setVisible] = useState<RetiredCourses['courses']>([]);

  useEffect(() => {
    const seen = new Set(readSeen());
    setVisible(retired.filter((course) => !seen.has(course.id)));
  }, [retired]);

  if (visible.length === 0) return null;

  return (
    <RetiredCard
      title={formatCopy(c.title, { course: visible.map((course) => course.title).join('، ') })}
      onDismiss={() => {
        writeSeen([...new Set([...readSeen(), ...visible.map((course) => course.id)])]);
        setVisible([]);
      }}
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
