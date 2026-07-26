import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@ayman/ui';
import { copy } from '@ayman/contracts';
import { getCourse } from '@/lib/catalog';
import { RichText } from '@/components/content/rich-text';
import { YouTubeEmbed } from '@/components/content/youtube-embed';

type Params = { slug: string };

/**
 * The one free-preview video lesson to feature above the outline, if any —
 * a video id is exposed only for free-preview lessons (the catalog service
 * strips it for everything else, so there is nothing further to check here).
 */
function findPreviewVideo(course: NonNullable<Awaited<ReturnType<typeof getCourse>>>) {
  for (const section of course.sections) {
    for (const lesson of section.lessons) {
      if (lesson.kind === 'video' && lesson.isFreePreview && lesson.videoExternalId) {
        return lesson;
      }
    }
  }
  return null;
}

export default async function CourseDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course) notFound();

  const preview = findPreviewVideo(course);

  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-16">
      <nav aria-label={copy.course.breadcrumbHome} className="mono mb-6 text-[length:var(--fs-mono-label)] text-fg-muted">
        <Link href="/" className="hover:text-fg">
          {copy.course.breadcrumbHome}
        </Link>
        {' / '}
        <Link href="/courses" className="hover:text-fg">
          {copy.course.breadcrumbCatalog}
        </Link>
        {' / '}
        <span className="text-fg">{course.title}</span>
      </nav>

      <p className="mono mb-2 text-[length:var(--fs-mono-label)] text-fg-muted">
        {course.systemNameAr} · {course.year}
        {course.trackLabelAr ? ` · ${course.trackLabelAr}` : ''} · {course.subjectNameAr}
      </p>
      <h1 className="mb-2 text-[length:var(--fs-title-1)] font-semibold">{course.title}</h1>
      {course.subtitle ? <p className="mb-6 max-w-[var(--w-prose)] text-fg-muted">{course.subtitle}</p> : null}

      {preview && preview.videoExternalId ? (
        <div className="mb-10 max-w-[var(--w-prose)]">
          <YouTubeEmbed externalId={preview.videoExternalId} title={preview.title} />
          <Badge tone="accent" className="mt-2">
            {copy.catalog.freePreview}
          </Badge>
        </div>
      ) : null}

      {course.description ? (
        <section className="mb-10 max-w-[var(--w-prose)]">
          <h2 className="mb-3 text-[length:var(--fs-title-3)] font-semibold">{copy.course.about}</h2>
          <RichText html={course.description} className="space-y-3 text-fg-muted" />
        </section>
      ) : null}

      <section className="max-w-[var(--w-prose)]">
        <h2 className="mb-4 text-[length:var(--fs-title-3)] font-semibold">{copy.course.content}</h2>
        <ul className="space-y-6">
          {course.sections.map((section) => (
            <li key={section.id}>
              <h3 className="mb-2 font-medium text-fg">{section.title}</h3>
              {section.summary ? <p className="mb-2 text-fg-muted">{section.summary}</p> : null}
              <ul className="space-y-2">
                {section.lessons.map((lesson) => (
                  <li
                    key={lesson.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                    <span className="mono shrink-0 text-[length:var(--fs-mono-label)] text-fg-muted">
                      {copy.course.lessonKind[lesson.kind]}
                    </span>
                    {lesson.isFreePreview ? (
                      <Badge tone="accent" className="shrink-0">
                        {copy.catalog.freePreview}
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
