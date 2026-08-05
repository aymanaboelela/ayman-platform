import type { CatalogCourse, CatalogCourseDetail } from '@ayman/contracts';

/**
 * WebMCP tool definitions — the actions an in-browser agent may take on this
 * site (webmachinelearning.github.io/webmcp).
 *
 * Kept as plain data and pure-ish functions, separate from the component that
 * registers them, for one reason: an `execute` callback that only ever runs
 * inside a browser extension's agent loop is otherwise untestable, and this is
 * code that talks to our API and formats what a third party will read back to
 * a student. `webmcp-tools.test.ts` drives every executor against a stub fetch.
 *
 * ⚠️ READ-ONLY, all three, and that is a boundary rather than a starting
 * point. WebMCP tools run with the page's own credentials — a signed-in
 * student's session cookie rides along on every same-origin fetch an agent
 * makes. A `enrol_in_course` or `submit_quiz_answer` tool would let a page an
 * agent is merely *looking at* take an action the student never chose, with
 * their session, and CSRF protection would not help: the request would be
 * perfectly legitimate. These tools are also mounted only on the `(site)`
 * marketing shell, so no signed-in surface exposes them at all.
 *
 * The descriptions are English (the agent-facing convention); everything the
 * tools RETURN is Arabic, because it goes to an Arabic-speaking student.
 */

/** The subset of the WebMCP surface this app uses — the DOM lib has no types for it yet. */
export interface WebMcpToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<WebMcpToolResult>;
}

const text = (value: string, isError = false): WebMcpToolResult => ({
  content: [{ type: 'text', text: value }],
  ...(isError ? { isError: true } : {}),
});

/**
 * Same-origin, always. `/api/*` is rewritten to the API by `next.config.ts`
 * and the browser must never see the API host — the single-origin invariant
 * that makes `__Host-` cookies and zero CORS possible. An absolute URL here
 * would be the one line that breaks it.
 */
async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

const courseLine = (course: CatalogCourse): string =>
  `- ${course.title} — ${course.subjectNameAr}${course.trackLabelAr ? ` · ${course.trackLabelAr}` : ''} · الصف ${course.year} · ${course.lessonCount} محاضرة\n  /courses/${course.slug}`;

/** Matches Arabic titles the way a student types them: substring, case-folded, hamza-tolerant. */
export function matchesQuery(course: CatalogCourse, query: string): boolean {
  // Egyptians overwhelmingly type Arabic without hamza (`ايمن`, not `أيمن`) —
  // the same normalisation problem `copy.seo.keywords` documents. Folding the
  // alef variants here is the difference between finding a course and being
  // told it does not exist.
  const fold = (value: string): string =>
    value.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي');

  const needle = fold(query.trim());
  if (!needle) return true;

  return [course.title, course.subtitle, course.subjectNameAr, course.trackLabelAr]
    .filter((field): field is string => Boolean(field))
    .some((field) => fold(field).includes(needle));
}

export function buildWebMcpTools(): WebMcpTool[] {
  return [
    {
      name: 'search_courses',
      description:
        'Search the published course catalog of this Egyptian Bakalorya computer-science platform by keyword and/or school year. Returns course titles, subjects and their URLs on this site.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Arabic or English keyword to match against course title, subject or track. Omit to list everything.',
          },
          year: {
            type: 'integer',
            enum: [1, 2, 3],
            description: 'Bakalorya school year (1, 2 or 3). Omit for all years.',
          },
        },
      },
      async execute(args) {
        const data = await fetchJson<{ courses: CatalogCourse[] }>('/api/catalog/courses');
        if (!data) return text('تعذّر الوصول لقائمة الكورسات دلوقتي.', true);

        const query = typeof args.query === 'string' ? args.query : '';
        const year = typeof args.year === 'number' ? args.year : null;

        const matches = data.courses
          .filter((course) => (year === null ? true : course.year === year))
          .filter((course) => matchesQuery(course, query));

        if (matches.length === 0) return text('مفيش كورسات مطابقة للبحث ده.');

        return text(`${matches.length} كورس:\n${matches.map(courseLine).join('\n')}`);
      },
    },
    {
      name: 'get_course',
      description:
        'Get one published course in full by its slug: description, section and lesson outline, duration and lesson count.',
      inputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'The course slug, as returned by search_courses.' },
        },
        required: ['slug'],
      },
      async execute(args) {
        const slug = typeof args.slug === 'string' ? args.slug : '';
        if (!slug) return text('محتاج slug الكورس.', true);

        const course = await fetchJson<CatalogCourseDetail>(
          `/api/catalog/courses/${encodeURIComponent(slug)}`,
        );
        if (!course) return text('مفيش كورس منشور بالـ slug ده.', true);

        const outline = course.sections
          .map(
            (section) =>
              `## ${section.title}\n${section.lessons.map((lesson) => `- ${lesson.title}`).join('\n')}`,
          )
          .join('\n');

        return text(
          [
            `# ${course.title}`,
            course.subtitle ?? '',
            course.description ?? '',
            `الصف ${course.year} · ${course.subjectNameAr} · ${course.lessonCount} محاضرة`,
            outline,
            `/courses/${course.slug}`,
            // Repeated in every tool result on purpose: an agent summarising
            // an outline of lesson titles reads a lot like an agent that has
            // the lessons. It does not.
            'الدروس نفسها محتاجة حساب طالب واشتراك في الكورس.',
          ]
            .filter(Boolean)
            .join('\n\n'),
        );
      },
    },
    {
      name: 'get_study_path',
      description:
        'Explain where a student should start on this platform given their school year, and which page to open.',
      inputSchema: {
        type: 'object',
        properties: {
          year: {
            type: 'integer',
            enum: [1, 2, 3],
            description: 'Bakalorya school year. Omit if the student has never programmed before.',
          },
        },
      },
      async execute(args) {
        const year = typeof args.year === 'number' ? args.year : null;
        if (year === null) {
          return text(
            'لو مبتدئ خالص: ابدأ من صفحة التأسيس /essentials — ١٢ مصطلح أساسي قبل أول سطر كود، وبعدين اختار سنتك من /courses.',
          );
        }
        return text(
          `كورسات الصف ${year}: /years/${year}\nكل الكورسات: /courses\nالحساب مجاني وأول محاضرة مفتوحة: /register`,
        );
      },
    },
  ];
}
