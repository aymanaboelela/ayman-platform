import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { copy } from '@ayman/contracts';
import type { CatalogCourseTerm } from '@ayman/contracts/catalog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscribePanel } from './subscribe-panel';

/**
 * The panel is the checkout, and everything asserted here is about ONE
 * property: what it is willing to sell comes from the API at the moment it
 * opens, never from the page it was opened on.
 *
 * That page is `'use cache'` with `cacheLife('hours')`, so its price props, its
 * `terms` and its `instapay` are all as old as a cache entry — and the three
 * dead ends below were all reachable from a stale one on a course that was very
 * much for sale. «هو جاي يدفع بيقولوا الكورس قفل، تواصل على واتساب… وأنا عايزه
 * إن ده لازم يدفع».
 *
 * Every case therefore passes DELIBERATELY WRONG props and asserts the panel
 * ignored them. Props that agreed with the API would prove nothing.
 */

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGet(...args),
    apiPost: (...args: unknown[]) => apiPost(...args),
  };
});

// Never reached by these tests — the panel imports it at module scope and it
// pulls in browser-only upload plumbing that has no business booting here.
vi.mock('@/lib/upload-client', () => ({
  uploadPaymentScreenshot: vi.fn(),
}));

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const SLUG = 'programming-y2';
const TERM: CatalogCourseTerm = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'الترم الأول',
  priceCents: 30000,
};

/** What `GET /api/catalog/courses/:slug` answers — only the fields the panel
 *  reads off it are given shape here; the schema parse is mocked away with
 *  `apiGet` itself. */
function liveCourse(overrides: Record<string, unknown> = {}) {
  return {
    monthlyPriceCents: 20000,
    quarterlyPriceCents: null,
    yearlyPriceCents: null,
    terms: [],
    ...overrides,
  };
}

function liveSettings(instapay: string | null = '+201021196367') {
  return { contact: { instapay } };
}

/**
 * Routes the three parallel reads the panel issues by path, so a test only has
 * to say what the API knows. `submissions/me` answers "nothing yet" unless a
 * test overrides it — the panel is otherwise gated on a pending claim and never
 * reaches the plan picker.
 */
function respondWith({
  course,
  settings,
  submissions = [],
}: {
  course?: unknown;
  settings?: unknown;
  submissions?: unknown[];
}) {
  apiGet.mockImplementation((path: string) => {
    if (path === '/api/payments/submissions/me') return Promise.resolve(submissions);
    if (path.startsWith('/api/catalog/courses/')) {
      return course === undefined
        ? Promise.reject(new Error('unreachable'))
        : Promise.resolve(course);
    }
    if (path === '/api/settings/public') {
      return settings === undefined
        ? Promise.reject(new Error('unreachable'))
        : Promise.resolve(settings);
    }
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
}

/** The stale cache entry every case starts from: a course that looks free, on a
 *  platform that looks like it has no transfer number. */
function Panel(props: Partial<React.ComponentProps<typeof SubscribePanel>> = {}) {
  return (
    <SubscribePanel
      courseId={COURSE_ID}
      slug={SLUG}
      monthlyPriceCents={null}
      quarterlyPriceCents={null}
      yearlyPriceCents={null}
      terms={[]}
      instapay={null}
      onCancel={() => {}}
      {...props}
    />
  );
}

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('SubscribePanel', () => {
  it('sells the plan the API knows about, not the one the cached page did', async () => {
    // The whole bug in one case: props say free, the live read says 200 EGP a
    // month. A course priced within the last hour is exactly this shape.
    respondWith({ course: liveCourse(), settings: liveSettings() });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.planMonthlyLabel)).toBeTruthy();
    expect(screen.queryByText(copy.subscribe.noPlans)).toBeNull();
  });

  it('offers a term the cached page had not heard of', async () => {
    // `terms` on the public payload is filtered to OPEN, PRICED terms, so a
    // term opened this morning is absent from an entry written last night.
    respondWith({
      course: liveCourse({ monthlyPriceCents: null, terms: [TERM] }),
      settings: liveSettings(),
    });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.planTermLabel)).toBeTruthy();
  });

  it('reads the transfer number live rather than sending anyone to WhatsApp', async () => {
    // The old panel returned `noNumber` on the FIRST render, from the cached
    // prop, before the live read had even been issued — and that string used to
    // read «الاشتراك مش متاح دلوقتي. تواصل معانا على واتساب.»
    respondWith({ course: liveCourse(), settings: liveSettings('+201021196367') });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.planMonthlyLabel)).toBeTruthy();
    expect(screen.queryByText(copy.subscribe.noNumber)).toBeNull();
  });

  it('still shows the plan picker when the submissions check fails', async () => {
    // `allSettled`, not `all`. A 429 on the student's own throttle, or no
    // session at all, makes that one call throw — and losing the live PRICE to
    // it would put the panel straight back on the props it exists to distrust.
    apiGet.mockImplementation((path: string) => {
      if (path === '/api/payments/submissions/me') return Promise.reject(new Error('429'));
      if (path.startsWith('/api/catalog/courses/')) return Promise.resolve(liveCourse());
      return Promise.resolve(liveSettings());
    });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.planMonthlyLabel)).toBeTruthy();
  });

  it('falls back to the cached props when the live read is unreachable', async () => {
    // Stale numbers beat no numbers: an API that cannot be reached must not
    // turn a course that was on sale a minute ago into a dead end.
    respondWith({ course: undefined, settings: undefined });

    render(
      <Panel monthlyPriceCents={20000} instapay="+201021196367" />,
    );

    expect(await screen.findByText(copy.subscribe.planMonthlyLabel)).toBeTruthy();
  });

  it('says the sale is not open — and offers a retry — when nothing really is for sale', async () => {
    // The one honest dead end left, and it now costs a live read to reach.
    // `noPlans`, not the old `course.lockedError` («رسالة للمهندس أيمن»), and
    // never `noNumber`: a course with no price is not a payment problem.
    respondWith({
      course: liveCourse({ monthlyPriceCents: null }),
      settings: liveSettings(null),
    });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.noPlans)).toBeTruthy();
    expect(screen.queryByText(copy.subscribe.noNumber)).toBeNull();
    expect(screen.getByRole('button', { name: copy.subscribe.retry })).toBeTruthy();
  });

  it('re-reads on «جرّب تاني» and opens checkout when the price has landed', async () => {
    // A student who opened the panel thirty seconds before the admin finished.
    // The press must not reload the page: they keep the dialog, the course and
    // their place, and the price arrives under them.
    respondWith({ course: liveCourse({ monthlyPriceCents: null }), settings: liveSettings() });

    render(<Panel />);
    const retry = await screen.findByRole('button', { name: copy.subscribe.retry });

    respondWith({ course: liveCourse(), settings: liveSettings() });
    retry.click();

    await waitFor(() => {
      expect(screen.getByText(copy.subscribe.planMonthlyLabel)).toBeTruthy();
    });
  });
});
