import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import type { CatalogCourse, CatalogCourseDetail } from '@ayman/contracts';
import {
  renderAboutMarkdown,
  renderCourseMarkdown,
  renderCoursesMarkdown,
  renderEssentialsMarkdown,
  renderHomeMarkdown,
  renderYearMarkdown,
} from './markdown-render';

const course = (overrides: Partial<CatalogCourse> = {}): CatalogCourse =>
  ({
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'python-basics',
    title: 'أساسيات بايثون',
    subtitle: null,
    systemSlug: 'bacalorya',
    systemNameAr: 'البكالوريا المصرية',
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

const detail = (overrides: Partial<CatalogCourseDetail> = {}): CatalogCourseDetail =>
  ({
    ...course(),
    description: 'وصف الكورس',
    sections: [
      {
        id: '00000000-0000-4000-8000-0000000000s1',
        title: 'القسم الأول',
        summary: 'ملخص القسم',
        lessons: [
          {
            id: '00000000-0000-4000-8000-0000000000l1',
            title: 'الدرس الأول',
            kind: 'video',
            estimatedSeconds: 300,
            isFreePreview: true,
            durationSeconds: 300,
          },
        ],
      },
    ],
    ...overrides,
  }) as CatalogCourseDetail;

const ALL_RENDERERS: [name: string, render: () => string][] = [
  ['home', () => renderHomeMarkdown([course()])],
  ['about', () => renderAboutMarkdown()],
  ['courses', () => renderCoursesMarkdown([course()])],
  ['essentials', () => renderEssentialsMarkdown()],
  ['year', () => renderYearMarkdown(1, [course()])],
  ['course', () => renderCourseMarkdown(detail())],
];

describe('every markdown document', () => {
  it('starts with a single h1', () => {
    for (const [name, render] of ALL_RENDERERS) {
      const lines = render().split('\n');
      expect(lines[0]?.startsWith('# '), name).toBe(true);
      expect(render().split('\n').filter((line) => line.startsWith('# ')).length, name).toBe(1);
    }
  });

  /**
   * The one an assistant will quote back to a parent. Without it, a summary of
   * a course outline reads exactly like a summary of the course.
   */
  it('states that lesson content needs an account', () => {
    for (const [name, render] of ALL_RENDERERS) {
      expect(render(), name).toContain(copy.agents.contentNote);
    }
  });

  it('links back to the canonical page it mirrors', () => {
    for (const [name, render] of ALL_RENDERERS) {
      expect(render(), name).toContain(copy.agents.sourcePage);
    }
  });

  it('never leaves a stray empty block from an absent optional field', () => {
    for (const [name, render] of ALL_RENDERERS) {
      expect(render(), name).not.toMatch(/\n{3,}/);
    }
  });
});

describe('renderCourseMarkdown', () => {
  it('renders the outline down to lesson titles', () => {
    const markdown = renderCourseMarkdown(detail());

    expect(markdown).toContain('القسم الأول');
    expect(markdown).toContain('الدرس الأول');
    expect(markdown).toContain(copy.agents.courseOutline);
  });

  /**
   * The contract boundary, asserted rather than trusted. `CatalogCourseDetail`
   * carries no `videoExternalId` by design — but it DOES carry `isFreePreview`
   * and lesson ids, and neither belongs in a document written for scraping.
   * A lesson id is the input to `/api/lessons/:id/player`; publishing a list of
   * them is publishing the attack surface, even though that route needs a
   * session and an enrolment.
   */
  it('publishes no lesson ids and no free-preview flags', () => {
    const markdown = renderCourseMarkdown(detail());

    expect(markdown).not.toContain('0000000000l1');
    expect(markdown).not.toContain('isFreePreview');
    expect(markdown).not.toContain('freePreview');
    expect(markdown).not.toContain(copy.catalog.freePreview);
  });

  it('omits the outline heading entirely for a course with no sections', () => {
    const markdown = renderCourseMarkdown(detail({ sections: [] }));

    expect(markdown).not.toContain(copy.agents.courseOutline);
    expect(markdown).toContain('أساسيات بايثون');
  });

  it('drops the track row when a course has no track', () => {
    expect(renderCourseMarkdown(detail())).not.toContain(copy.agents.metaTrack);
    expect(renderCourseMarkdown(detail({ trackLabelAr: 'تطبيقات الموبايل' }))).toContain(
      copy.agents.metaTrack,
    );
  });
});

describe('renderYearMarkdown', () => {
  it('lists only that year and says so when empty', () => {
    const courses = [course({ year: 1 }), course({ slug: 'y2', year: 2, title: 'كورس تاني' })];

    expect(renderYearMarkdown(1, courses)).toContain('أساسيات بايثون');
    expect(renderYearMarkdown(1, courses)).not.toContain('كورس تاني');
    expect(renderYearMarkdown(3, courses)).toContain(copy.years.empty);
  });

  /* The markdown twin and the HTML page have to list the same courses — an
     agent reading `/years/1.md` on a student's behalf must not be told the
     year is empty while the page is offering them a course. */
  it('carries the foundation course onto a year that does not own it', () => {
    const courses = [course({ slug: 'found', year: 2, title: 'الكورس التأسيسي' })];

    expect(renderYearMarkdown(1, courses)).toContain('الكورس التأسيسي');
    expect(renderYearMarkdown(1, courses)).not.toContain(copy.years.empty);
  });

  it('does not list it twice on its own year', () => {
    const md = renderYearMarkdown(2, [course({ slug: 'found', year: 2, title: 'الكورس التأسيسي' })]);

    expect(md.match(/\/courses\/found/g)).toHaveLength(1);
  });
});

describe('renderCoursesMarkdown', () => {
  it('links every course at its real URL', () => {
    expect(renderCoursesMarkdown([course()])).toContain('/courses/python-basics');
  });

  it('says so rather than rendering an empty list', () => {
    expect(renderCoursesMarkdown([])).toContain(copy.catalog.empty);
  });
});
