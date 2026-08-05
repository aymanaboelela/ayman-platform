import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogCourse } from '@ayman/contracts';
import { buildWebMcpTools, matchesQuery, type WebMcpToolResult } from './webmcp-tools';

/** `noUncheckedIndexedAccess` is on; assert the entry exists rather than `!` it. */
const firstText = (result: WebMcpToolResult): string => {
  const [entry] = result.content;
  expect(entry).toBeDefined();
  return entry?.text ?? '';
};

/** The path the tool actually fetched, or `undefined` if it never called out. */
const fetchedPath = (): unknown => vi.mocked(fetch).mock.calls[0]?.[0];

const course = (overrides: Partial<CatalogCourse> = {}): CatalogCourse =>
  ({
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'python-basics',
    title: 'أساسيات البرمجة بلغة بايثون',
    subtitle: null,
    systemSlug: 'bakalorya',
    systemNameAr: 'البكالوريا',
    year: 1,
    trackLabelAr: null,
    subjectNameAr: 'علوم الحاسب',
    coverKey: null,
    lessonCount: 12,
    totalSeconds: 3600,
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as CatalogCourse;

const stubFetch = (body: unknown, ok = true): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, json: async () => body })),
  );
};

const tool = (name: string) => {
  const found = buildWebMcpTools().find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no such tool: ${name}`);
  return found;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('matchesQuery', () => {
  it('matches on title, subject and track', () => {
    expect(matchesQuery(course(), 'بايثون')).toBe(true);
    expect(matchesQuery(course(), 'علوم')).toBe(true);
    expect(matchesQuery(course({ trackLabelAr: 'تطبيقات' }), 'تطبيقات')).toBe(true);
  });

  /**
   * The reason this is not `String.includes`. Egyptians type Arabic without
   * hamza — the same normalisation `copy.seo.keywords` carries for search
   * engines. Without folding, a student asking for «اساسيات» is told the
   * course does not exist.
   */
  it('folds hamza and the alef variants the way students actually type', () => {
    expect(matchesQuery(course(), 'اساسيات')).toBe(true);
    expect(matchesQuery(course({ title: 'اساسيات' }), 'أساسيات')).toBe(true);
  });

  it('treats an empty query as "everything"', () => {
    expect(matchesQuery(course(), '')).toBe(true);
    expect(matchesQuery(course(), '   ')).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(matchesQuery(course(), 'كيمياء')).toBe(false);
  });
});

describe('search_courses', () => {
  it('lists matching courses with their slugs', async () => {
    stubFetch({ courses: [course(), course({ slug: 'algebra', title: 'جبر', year: 2 })] });

    const result = await tool('search_courses').execute({ query: 'بايثون' });

    expect(firstText(result)).toContain('python-basics');
    expect(firstText(result)).not.toContain('algebra');
    expect(result.isError).toBeUndefined();
  });

  it('filters by year', async () => {
    stubFetch({ courses: [course({ year: 1 }), course({ slug: 'y2', year: 2 })] });

    const result = await tool('search_courses').execute({ year: 2 });

    expect(firstText(result)).toContain('y2');
    expect(firstText(result)).not.toContain('python-basics');
  });

  it('says so rather than erroring when nothing matches', async () => {
    stubFetch({ courses: [course()] });

    const result = await tool('search_courses').execute({ query: 'كيمياء' });

    expect(result.isError).toBeUndefined();
    expect(firstText(result)).toContain('مفيش');
  });

  it('reports an error instead of throwing when the API is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );

    const result = await tool('search_courses').execute({});

    expect(result.isError).toBe(true);
  });

  /** Single-origin invariant: the browser must never see the API host. */
  it('fetches same-origin relative paths only', async () => {
    stubFetch({ courses: [] });

    await tool('search_courses').execute({});

    expect(fetchedPath()).toBe('/api/catalog/courses');
  });
});

describe('get_course', () => {
  it('renders the outline and states that lessons need an account', async () => {
    stubFetch({
      ...course(),
      description: 'وصف',
      sections: [{ id: 's1', title: 'المقدمة', summary: null, lessons: [{ title: 'الدرس الأول' }] }],
    });

    const result = await tool('get_course').execute({ slug: 'python-basics' });

    expect(firstText(result)).toContain('المقدمة');
    expect(firstText(result)).toContain('الدرس الأول');
    // Every course result must carry this, or an agent summarising an outline
    // reads as though the lessons themselves were available.
    expect(firstText(result)).toContain('حساب طالب');
  });

  it('escapes the slug into the URL', async () => {
    stubFetch(null, false);

    await tool('get_course').execute({ slug: 'a b/c' });

    expect(fetchedPath()).toBe('/api/catalog/courses/a%20b%2Fc');
  });

  it('errors on a missing slug without calling the API', async () => {
    stubFetch({});

    const result = await tool('get_course').execute({});

    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('errors for an unpublished or unknown course', async () => {
    stubFetch(null, false);

    const result = await tool('get_course').execute({ slug: 'draft' });

    expect(result.isError).toBe(true);
  });
});

describe('get_study_path', () => {
  it('sends a complete beginner to essentials', async () => {
    const result = await tool('get_study_path').execute({});
    expect(firstText(result)).toContain('/essentials');
  });

  it('sends a student with a year to that year listing', async () => {
    const result = await tool('get_study_path').execute({ year: 2 });
    expect(firstText(result)).toContain('/years/2');
  });
});

describe('the tool set as a whole', () => {
  it('is read-only — no tool name implies a write', () => {
    // WebMCP tools run with the page's own credentials. A write tool here
    // would let an agent act as the student without them choosing to.
    const writeVerbs = /^(create|update|delete|enrol|enroll|submit|post|buy|pay|set)_/;
    for (const candidate of buildWebMcpTools()) {
      expect(candidate.name).not.toMatch(writeVerbs);
    }
  });

  it('gives every tool a name, a description and an object input schema', () => {
    for (const candidate of buildWebMcpTools()) {
      expect(candidate.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(candidate.description.length).toBeGreaterThan(20);
      expect(candidate.inputSchema).toMatchObject({ type: 'object' });
    }
  });
});
