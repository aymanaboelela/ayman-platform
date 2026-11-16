import {
  CatalogCourseDetailSchema,
  CatalogListSchema,
  type CatalogCourse,
  type CatalogCourseDetail,
} from '@ayman/contracts/catalog';
import { ProfileMeSchema } from '@ayman/contracts/profile';
import { TaxonomySchema, type Taxonomy } from '@ayman/contracts/taxonomy';
import { apiFetch, apiGet, apiPatch } from '@/lib/api';
import { CODE_ASKS_GRADE, codeAsksGrade, codeSectionFor } from '@/lib/code-section';
import { HIGHEST_OFFERED_YEAR, offeredYearOptions } from '@/lib/section-defaults';
import { gradesOf } from '@/lib/tenant-grades';
import { TEACHES_CODE } from '@/lib/tenant-subject';
import type { Owned, Stream, YearOption } from './guide-options';

/**
 * Every request the guide makes, and the two writes.
 *
 * ## Live, from the browser, on purpose
 *
 * These are the same public endpoints `lib/catalog.ts` wraps in `'use cache'`
 * on the server. Called from here they go through the `/api/*` rewrite
 * straight to Nest, past every Next cache — which is the point: a price shown
 * to somebody deciding whether to pay must not be an hours-old cache entry
 * (the lesson `SubscribePanel` records at length under `LivePlans`). The guide
 * shows prices, the panel re-reads them, the server charges by its own; all
 * three now start from the same uncached read.
 *
 * ## Zod lives here, behind the `import()`
 *
 * This module builds schemas, so it must never be reachable from
 * `guide-launcher.tsx` — the launcher is in three layouts. It is only ever
 * imported by the guide itself, which is a chunk loaded when the guide shows.
 */

export async function loadCatalog(): Promise<CatalogCourse[]> {
  return (await apiGet('/api/catalog/courses', CatalogListSchema)).courses;
}

export async function loadCourse(slug: string): Promise<CatalogCourseDetail> {
  return apiGet(`/api/catalog/courses/${encodeURIComponent(slug)}`, CatalogCourseDetailSchema);
}

/**
 * What this student already holds in a course — owned months, «every month is
 * covered», and whether a claim is already in review. The checkout makes this
 * exact read before it draws its month picker (`OWNED_MONTHS_SCHEMA` in
 * `subscribe-panel.tsx`), and `MonthOfferCard` reads `pending` off it for the
 * same reason the guide does: `submit()` refuses a second claim.
 *
 * `null` for anything but a clean answer — a visitor (401), a throttle, a
 * shape that is not the shape. «Nothing known to be owned» is what the panel
 * assumes in those cases too, and the server is what refuses a month that is
 * already held; the guide must not be the thing that blocks a sale on a read
 * that merely failed.
 */
export async function loadOwned(courseId: string): Promise<Owned | null> {
  try {
    const response = await apiFetch(`/api/payments/courses/${encodeURIComponent(courseId)}/months/mine`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      ownedMonthIds?: unknown;
      coversAll?: unknown;
      pending?: unknown;
    } | null;
    if (!body || !Array.isArray(body.ownedMonthIds)) return null;
    return {
      ownedMonthIds: body.ownedMonthIds.filter((id): id is string => typeof id === 'string'),
      coversAll: body.coversAll === true,
      pending: body.pending === true,
    };
  } catch {
    return null;
  }
}

/** The transfer rails this stack has a number for. */
export interface Rails {
  instapay: boolean;
  vodafoneCash: boolean;
}

/**
 * Hand-narrowed rather than parsed with `PublicSettingsReadSchema`: the guide
 * needs two booleans for one optional line, and that schema drags the whole
 * settings contract (branding, SEO, books, video…) into this chunk behind it.
 * The checkout reads the numbers themselves, through the schema, when it opens.
 */
export async function loadRails(): Promise<Rails> {
  const response = await apiFetch('/api/settings/public', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`GET /api/settings/public failed with ${response.status}`);
  const body = (await response.json()) as { contact?: { instapay?: unknown; vodafoneCash?: unknown } } | null;
  const has = (value: unknown) => typeof value === 'string' && value.trim() !== '';
  return { instapay: has(body?.contact?.instapay), vodafoneCash: has(body?.contact?.vodafoneCash) };
}

export interface Viewer {
  signedIn: boolean;
  /** What the profile already holds — `null`s for a visitor. */
  saved: { year: number | null; systemId: string | null; stream: Stream | null };
}

const VISITOR: Viewer = { signedIn: false, saved: { year: null, systemId: null, stream: null } };

/**
 * Who is looking, asked again when the dialog opens.
 *
 * The launcher asked once already, but the answer changes under a guide that
 * is in progress: a visitor who registered and came back to the pill is now a
 * student, and the last step is «pay», not «create an account».
 *
 * 401 and only 401 is «no session». Anything else unexpected is treated as a
 * visitor too, which is the safe reading here: the worst outcome is being
 * offered the register page, and `proxy.ts` sends a signed-in student who
 * lands there straight on to `next`.
 */
export async function loadViewer(): Promise<Viewer> {
  let response: Response;
  try {
    response = await apiFetch('/api/session', { headers: { accept: 'application/json' } });
  } catch {
    return VISITOR;
  }
  if (!response.ok) return VISITOR;

  try {
    const { profile } = await apiGet('/api/profile/me', ProfileMeSchema);
    return {
      signedIn: true,
      saved: {
        year: profile?.year ?? null,
        systemId: profile?.systemId ?? null,
        stream: profile?.schoolStream ?? null,
      },
    };
  } catch {
    // Signed in, profile unreadable: ask the questions rather than guess.
    return { signedIn: true, saved: { year: null, systemId: null, stream: null } };
  }
}

/**
 * The taxonomy — the stack's own wording for each year («الصف الأول الثانوي»،
 * «الصف الثاني بكالوريا»), and what turns a profile's system id into a slug.
 * `null` when it cannot be read: the guide then labels years from the copy
 * table, exactly as the public year pages do.
 */
export async function loadTaxonomy(): Promise<Taxonomy | null> {
  try {
    return await apiGet('/api/taxonomy', TaxonomySchema);
  } catch {
    return null;
  }
}

/**
 * Whether the onboarding wizard can hold this year.
 *
 * On a stack that teaches code without asking a grade — the original one —
 * the wizard offers the first `HIGHEST_OFFERED_YEAR` years and nothing else
 * (`lib/section-defaults.ts`). A draft carrying a year its select has no
 * option for would sit in the form as an invisible value and could be
 * submitted without ever being seen. Any other stack validates a seeded year
 * against cards the student can see, so it is safe to offer.
 */
export function wizardHoldsYear(year: number): boolean {
  if (TEACHES_CODE && !CODE_ASKS_GRADE) return year <= HIGHEST_OFFERED_YEAR;
  return true;
}

/**
 * The year a signed-in student picked, written to their profile — through the
 * route the student's own «بياناتك» screen uses, with the section resolved the
 * same way that screen resolves it (`codeSectionFor`).
 *
 * Only on a stack that teaches code. Elsewhere the section is a system, a
 * year AND a track the student chose (`lib/subject-section.ts`), and writing a
 * year without its track would un-pick the track; there the guide's answer
 * steers the guide and the profile is left to the screen that owns it.
 *
 * The stream is not written here at all: `PATCH /profile/section` cannot
 * carry it, and the route that can (`/profile/onboarding`) is an upsert of the
 * WHOLE profile — replaying it from here could move a centre booking or blank
 * a field this file never read. A student changes it on «بياناتك».
 *
 * Never throws: a failed save must not stand between a student and paying.
 */
export async function saveYear(option: YearOption, taxonomy: Taxonomy | null): Promise<boolean> {
  if (!TEACHES_CODE || taxonomy === null) return false;
  try {
    const asksGrade = codeAsksGrade(taxonomy);
    const known = asksGrade
      ? gradesOf(taxonomy).some((grade) => grade.system === option.systemSlug && grade.year === option.year)
      : offeredYearOptions(taxonomy).some((offered) => offered.value === String(option.year));
    // A year the profile screens cannot show is not written behind their back.
    if (!known) return false;
    await apiPatch(
      '/api/profile/section',
      codeSectionFor(taxonomy, { system: option.systemSlug, year: option.year }),
    );
    return true;
  } catch {
    return false;
  }
}
