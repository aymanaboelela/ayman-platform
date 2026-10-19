import { cacheLife, cacheTag } from 'next/cache';
import {
  PracticePublicListSchema,
  PracticePublicSetSchema,
  type PracticePublicList,
  type PracticePublicSet,
  type PracticePublicSetSummary,
  type PracticeTrack,
  type PracticeYear,
} from '@ayman/contracts/practice';
import { apiGet, apiGetOrNull } from '@/lib/api';
import { TAG_PRACTICE } from '@/lib/cache-tags';

/**
 * «اختبارات مجانية» — loaders and the presentation the public pages share.
 *
 * The sets live in the database and are managed from `/admin/practice`
 * (`@ayman/contracts/practice` explains why they are not question-bank rows).
 * Every read here is `'use cache'` under `TAG_PRACTICE`, which each dashboard
 * action invalidates, so an edit shows up on the next request rather than
 * after `cacheLife` runs out.
 *
 * ⚠️ `…OrEmpty` on the list, like `getNewsListOrEmpty`: the landing page, the
 * sitemap and the index render inside `docker build`, where no API answers,
 * and on a stack whose `practice.enabled` flag is off the API 404s. Both mean
 * «no sets», never a thrown render.
 */

export type { PracticeTrack, PracticeYear };

export async function getPracticeListOrEmpty(): Promise<PracticePublicList> {
  'use cache';
  cacheLife('minutes');
  cacheTag(TAG_PRACTICE);
  try {
    return await apiGet('/api/practice/sets', PracticePublicListSchema);
  } catch {
    return { sets: [] };
  }
}

/** One set with its questions and key, or `null` (missing, unpublished, or the feature off). */
export async function getPracticeSet(
  year: PracticeYear,
  track: PracticeTrack,
  lessonCode: string,
): Promise<PracticePublicSet | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(TAG_PRACTICE);
  try {
    return await apiGetOrNull(
      `/api/practice/sets/${year}/${track}/${encodeURIComponent(lessonCode)}`,
      PracticePublicSetSchema,
    );
  } catch {
    return null;
  }
}

// ── URLs ─────────────────────────────────────────────────────────────────

export function practicePath(year: PracticeYear, track?: PracticeTrack, lessonCode?: string): string {
  if (!track) return `/practice/${year}`;
  return lessonCode ? `/practice/${year}/${track}/${lessonCode}` : `/practice/${year}/${track}`;
}

export function parsePracticeYear(raw: string): PracticeYear | null {
  return raw === '1' ? 1 : raw === '2' ? 2 : null;
}

export function parsePracticeTrack(raw: string): PracticeTrack | null {
  return raw === 'arabic' || raw === 'languages' ? raw : null;
}

export const LESSON_CODE = /^\d{1,2}-\d{1,2}$/;

/** The Arabic-track course each year's CTA opens; the Languages one for `languages`. */
export function practiceCourseSlug(year: PracticeYear, track: PracticeTrack): string {
  return `programming-cs-year${year}-2027-${track === 'languages' ? 'languages' : 'general'}`;
}

// ── presentation ─────────────────────────────────────────────────────────

/** One of four colour families the page has tokens for; see `practice.css`. */
export type PracticeTone = 'accent' | 'ok' | 'info' | 'warn';

/** A lucide icon name, resolved in `components/practice/unit-icon.tsx`. */
export type PracticeIcon =
  | 'cpu'
  | 'shield'
  | 'globe'
  | 'palette'
  | 'info'
  | 'scale'
  | 'lock'
  | 'binary'
  | 'book';

/**
 * The look of each known unit. Keyed on (year, unit number) — the number is
 * the part of the lesson code before the dash — so it holds for both tracks
 * and for any lesson the dashboard adds later. An unknown unit cycles through
 * the four tones with a book icon rather than going grey.
 */
const UNIT_LOOK: Record<string, { tone: PracticeTone; icon: PracticeIcon }> = {
  '1-1': { tone: 'info', icon: 'info' },
  '1-2': { tone: 'warn', icon: 'scale' },
  '1-3': { tone: 'ok', icon: 'lock' },
  '1-6': { tone: 'accent', icon: 'binary' },
  '2-1': { tone: 'accent', icon: 'cpu' },
  '2-2': { tone: 'ok', icon: 'shield' },
  '2-3': { tone: 'info', icon: 'globe' },
  '2-4': { tone: 'warn', icon: 'palette' },
};
const TONE_CYCLE: readonly PracticeTone[] = ['accent', 'ok', 'info', 'warn'];

export function unitNumber(lessonCode: string): number {
  return Number(lessonCode.split('-')[0]) || 0;
}

function lessonNumber(lessonCode: string): number {
  return Number(lessonCode.split('-')[1]) || 0;
}

export function unitLook(year: PracticeYear, unit: number): { tone: PracticeTone; icon: PracticeIcon } {
  return UNIT_LOOK[`${year}-${unit}`] ?? { tone: TONE_CYCLE[unit % TONE_CYCLE.length]!, icon: 'book' };
}

export interface PracticeUnit {
  number: number;
  title: string;
  tone: PracticeTone;
  icon: PracticeIcon;
  sets: PracticePublicSetSummary[];
}

const ORDINAL: Record<number, string> = {
  1: 'الأولى',
  2: 'الثانية',
  3: 'الثالثة',
  4: 'الرابعة',
  5: 'الخامسة',
  6: 'السادسة',
  7: 'السابعة',
  8: 'الثامنة',
};

/** One year and track's sets, grouped by unit and ordered as the book is. */
export function practiceUnits(
  sets: readonly PracticePublicSetSummary[],
  year: PracticeYear,
  track: PracticeTrack,
): PracticeUnit[] {
  const mine = sets
    .filter((s) => s.year === year && s.track === track)
    .sort(
      (a, b) =>
        unitNumber(a.lessonCode) - unitNumber(b.lessonCode) ||
        lessonNumber(a.lessonCode) - lessonNumber(b.lessonCode),
    );
  const units = new Map<number, PracticeUnit>();
  for (const set of mine) {
    const n = unitNumber(set.lessonCode);
    let unit = units.get(n);
    if (!unit) {
      unit = {
        number: n,
        title: set.unitTitle ?? `الوحدة ${ORDINAL[n] ?? n}`,
        ...unitLook(year, n),
        sets: [],
      };
      units.set(n, unit);
    }
    unit.sets.push(set);
  }
  return [...units.values()];
}

/** «612 سؤال على 29 درس» — for the hero and the landing invite. */
export function practiceTotals(
  sets: readonly PracticePublicSetSummary[],
  filter?: { year?: PracticeYear; track?: PracticeTrack },
): { lessons: number; questions: number } {
  const mine = sets.filter(
    (s) => (!filter?.year || s.year === filter.year) && (!filter?.track || s.track === filter.track),
  );
  return { lessons: mine.length, questions: mine.reduce((n, s) => n + s.questionCount, 0) };
}
