import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { copy } from '../copy/ar';
import {
  ASK_ACTIONS_MAX,
  ASK_ACTION_HREFS,
  ASK_ACTION_LABEL_MAX,
  asAskActions,
  asAskEvent,
  askActionMenu,
  askActions,
  isAskActionId,
  isAskHref,
  readGoMarkers,
  type AskActionId,
} from './ask';

/**
 * A button that 404s is worse than no button.
 *
 * That sentence is the whole reason this file exists, and everything below is
 * one of the two ways it gets broken: a model naming a place that is not on
 * the platform, and a route that WAS on the platform until somebody renamed a
 * folder. The first is caught by dropping what is not in the table; the second
 * only by reading the filesystem, which is what the last block does.
 */

const actionIds = Object.keys(ASK_ACTION_HREFS) as AskActionId[];

/* ────────────────────────────────────────────────────────────────────────
 * askActions — the server-side boundary, where a model's word becomes a link.
 * ──────────────────────────────────────────────────────────────────────── */

describe('askActions', () => {
  it('turns an id into the label and the path the platform declares', () => {
    // Neither string came from the caller: the label is copy, the href is the
    // table. That is the property, stated once.
    expect(askActions(['results'])).toEqual([
      { label: copy.assistant.ai.actions.results, href: '/results' },
    ]);
  });

  it('keeps the order the answer named them in', () => {
    // The first button is the one the answer was mostly about.
    expect(askActions(['books', 'orders']).map((action) => action.href)).toEqual([
      '/books',
      '/store/orders',
    ]);
  });

  it('DROPS an id that is not a destination, and keeps the rest', () => {
    /*
     * The failure this feature is one hallucination away from. A model that
     * invents `/support` must cost the answer a button, never hand the student
     * a link into nothing — and must not cost it the buttons that were real.
     */
    expect(askActions(['support', 'results', '/dashboard', 'الكورسات'])).toEqual([
      { label: copy.assistant.ai.actions.results, href: '/results' },
    ]);
  });

  it('drops the shapes an attacker reaches for as well as the ones a model does', () => {
    // `Object.hasOwn` rather than `in`, which is why these are not buttons to
    // `undefined` — the same check `isAssistantNodeId` makes next door.
    expect(askActions(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])).toEqual([]);
  });

  it('never returns more than three', () => {
    const many = askActions([...actionIds]);
    expect(many).toHaveLength(ASK_ACTIONS_MAX);
  });

  it('never returns the same destination twice', () => {
    // Two ids can resolve to one path, and two identical pills read as a bug.
    expect(askActions(['results', 'results', 'path']).map((action) => action.href)).toEqual([
      '/results',
      '/path',
    ]);
  });

  it('tolerates whitespace around an id, because a marker is text', () => {
    expect(askActions([' results '])).toHaveLength(1);
  });

  describe('a course page', () => {
    const catalog = [
      { slug: 'python-first-year', title: 'بايثون — أولى ثانوي' },
      { slug: 'databases', title: 'قواعد البيانات' },
    ];

    it('resolves against the catalog, and takes the title from it', () => {
      expect(askActions(['course:databases'], catalog)).toEqual([
        { label: 'قواعد البيانات', href: '/courses/databases' },
      ]);
    });

    it('drops a slug the catalog does not have', () => {
      /*
       * The whole point of validating against the SNAPSHOT rather than against
       * the shape of the string: `/courses/algebra` is a perfectly well-formed
       * path and a 404 for a course nobody published.
       */
      expect(askActions(['course:algebra'], catalog)).toEqual([]);
    });

    it('drops every course when no catalog was passed', () => {
      // The safe default. A caller that forgot the snapshot loses a button; it
      // does not gain a guess.
      expect(askActions(['course:databases'])).toEqual([]);
    });

    it('shortens a title too long to be a pill', () => {
      const long = [{ slug: 'x-y', title: 'ا'.repeat(ASK_ACTION_LABEL_MAX + 20) }];
      const [action] = askActions(['course:x-y'], long);
      expect(action!.label.length).toBe(ASK_ACTION_LABEL_MAX);
      expect(action!.label.endsWith('…')).toBe(true);
    });
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * asAskActions — the reader's fence, on a frame that arrived over a wire.
 * ──────────────────────────────────────────────────────────────────────── */

describe('asAskActions', () => {
  it('keeps a button whose path this app serves', () => {
    expect(asAskActions([{ label: 'نتائجي', href: '/results' }])).toEqual([
      { label: 'نتائجي', href: '/results' },
    ]);
  });

  it('keeps a course page, which is a shape rather than a member', () => {
    expect(asAskActions([{ label: 'بايثون', href: '/courses/python-first-year' }])).toHaveLength(1);
  });

  it('DROPS an unknown path rather than rendering a dead button', () => {
    expect(asAskActions([{ label: 'الدعم', href: '/support' }])).toEqual([]);
    expect(asAskActions([{ label: 'صفحة', href: '/results/extra' }])).toEqual([]);
    expect(asAskActions([{ label: 'صفحة', href: '/RESULTS' }])).toEqual([]);
  });

  it('drops anything that leaves the app', () => {
    /*
     * An `href` reaches a `<Link>`. An absolute URL here is an off-site
     * navigation drawn as the platform's own primary button — the exact shape
     * of a phishing link, arriving on the one surface a student is told to
     * trust. `//` is the protocol-relative version of the same thing.
     */
    for (const href of [
      'https://example.com/results',
      '//example.com',
      'javascript:alert(1)',
      'results',
      '',
    ]) {
      expect(asAskActions([{ label: 'برّه', href }])).toEqual([]);
    }
  });

  it('drops a label that is empty, blank or longer than a pill', () => {
    expect(asAskActions([{ label: '   ', href: '/results' }])).toEqual([]);
    expect(
      asAskActions([{ label: 'ا'.repeat(ASK_ACTION_LABEL_MAX + 1), href: '/results' }]),
    ).toEqual([]);
  });

  it('trims a label rather than rejecting it', () => {
    expect(asAskActions([{ label: '  نتائجي\n', href: '/results' }])[0]!.label).toBe('نتائجي');
  });

  it('survives every shape that is not a list of buttons', () => {
    // It is parsing JSON off a socket: `null`, a string, a number, an object
    // and a list of junk all have to end the same way.
    for (const value of [null, undefined, 'results', 42, { href: '/results' }, [null, 7, 'x']]) {
      expect(asAskActions(value)).toEqual([]);
    }
    expect(asAskActions([{ label: 5, href: '/results' }])).toEqual([]);
    expect(asAskActions([{ label: 'نتائجي' }])).toEqual([]);
  });

  it('caps and dedupes what it was sent', () => {
    const sent = [
      { label: 'أ', href: '/results' },
      { label: 'ب', href: '/results' },
      { label: 'ج', href: '/path' },
      { label: 'د', href: '/library' },
      { label: 'ه', href: '/profile' },
    ];
    expect(asAskActions(sent).map((action) => action.href)).toEqual([
      '/results',
      '/path',
      '/library',
    ]);
  });
});

describe('isAskHref', () => {
  it('accepts every declared destination', () => {
    expect(actionIds.filter((id) => !isAskHref(ASK_ACTION_HREFS[id]))).toEqual([]);
  });

  it('rejects a course path that is not slug-shaped', () => {
    expect(isAskHref('/courses/Python')).toBe(false);
    expect(isAskHref('/courses/a--b')).toBe(false);
    expect(isAskHref('/courses/x/lessons/1')).toBe(false);
    expect(isAskHref('/courses/')).toBe(false);
  });
});

describe('isAskActionId', () => {
  it('accepts a declared id and nothing else', () => {
    expect(isAskActionId('results')).toBe(true);
    expect(isAskActionId('__proto__')).toBe(false);
    expect(isAskActionId('')).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * The wire.
 * ──────────────────────────────────────────────────────────────────────── */

describe('asAskEvent', () => {
  it('carries the buttons on a done frame', () => {
    const event = asAskEvent({
      t: 'done',
      escalate: false,
      actions: [{ label: 'نتائجي', href: '/results' }],
    });
    expect(event).toEqual({
      t: 'done',
      escalate: false,
      actions: [{ label: 'نتائجي', href: '/results' }],
    });
  });

  it('drops a dead button off an otherwise valid frame', () => {
    // The frame is still an answer. Only the link is thrown away.
    const event = asAskEvent({
      t: 'done',
      escalate: true,
      actions: [{ label: 'الدعم', href: '/support' }],
    });
    expect(event).toEqual({ t: 'done', escalate: true, actions: [] });
  });

  it('reads a done frame that predates buttons', () => {
    // An older server, a cached bundle, a test double.
    expect(asAskEvent({ t: 'done', escalate: false })).toEqual({
      t: 'done',
      escalate: false,
      actions: [],
    });
  });
});

describe('readGoMarkers', () => {
  it('takes the ids out of the text', () => {
    const { text, ids } = readGoMarkers('الأسعار في صفحة الكتب.[[GO:books]]');
    expect(text).toBe('الأسعار في صفحة الكتب.');
    expect(ids).toEqual(['books']);
  });

  it('reads several, in order, including a course', () => {
    const { ids } = readGoMarkers('[[GO:courses]] كلام [[GO:course:python-1]]');
    expect(ids).toEqual(['courses', 'course:python-1']);
  });

  it('leaves an answer with no markers exactly as it was', () => {
    const answer = 'الكتاب في السكة، وهنكلّمك قبلها بيوم.';
    expect(readGoMarkers(answer)).toEqual({ text: answer, ids: [] });
  });

  it('does not carry state between calls', () => {
    // `ASK_GO_PATTERN` is `/g`, and a `/g` regex reused through `.test()`
    // alternates true and false. `replace` resets it; this asserts that it
    // stays reset.
    expect(readGoMarkers('[[GO:books]]').ids).toEqual(['books']);
    expect(readGoMarkers('[[GO:books]]').ids).toEqual(['books']);
  });
});

describe('askActionMenu', () => {
  it('names every destination once', () => {
    const menu = askActionMenu();
    expect(menu.split('\n')).toHaveLength(actionIds.length);
    // The prompt is the only place the model learns these exist. An id missing
    // from the menu is a button that can never be asked for.
    for (const id of actionIds) expect(menu).toContain(`${id} — ${copy.assistant.ai.actions[id]}`);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * …and the routes are REAL.
 * ──────────────────────────────────────────────────────────────────────── */

/** Every route `apps/web/app` actually serves, route groups collapsed away. */
function appRoutes(): Set<string> {
  const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../apps/web/app');
  const routes = new Set<string>();

  const walk = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && /^page\.(tsx|ts|jsx|js)$/.test(entry.name)) {
        routes.add(`/${segments.join('/')}`.replace(/\/$/, '') || '/');
        continue;
      }
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;
      /*
       * `(site)` and friends are ROUTE GROUPS — they organise the tree and
       * contribute nothing to the URL, which is exactly why `/store` lives at
       * `app/(app)/store` and a naive path join would miss it. `@slot` and
       * `_private` are Next's other two folder kinds that are not segments.
       */
      const grouped = entry.name.startsWith('(') || entry.name.startsWith('@') || entry.name.startsWith('_');
      walk(path.join(dir, entry.name), grouped ? segments : [...segments, entry.name]);
    }
  };

  walk(root, []);
  return routes;
}

describe('every destination is a page this app serves', () => {
  it('resolves each href to a page.tsx in apps/web/app', () => {
    /*
     * The check nothing else in the system makes.
     *
     * A renamed folder breaks no import and fails no type — `/store/orders` is
     * a string here and a directory over there, and the two are held together
     * by nothing but this test. The symptom in production would be a student
     * pressing the one button المساعد drew for them and landing on a 404,
     * which is precisely the outcome this feature exists to avoid.
     */
    const routes = appRoutes();
    const dead = actionIds
      .filter((id) => !routes.has(ASK_ACTION_HREFS[id]))
      .map((id) => `${id} → ${ASK_ACTION_HREFS[id]}`);
    expect(dead).toEqual([]);
  });

  it('finds the course page the course buttons are built on', () => {
    expect(appRoutes().has('/courses/[slug]')).toBe(true);
  });
});
