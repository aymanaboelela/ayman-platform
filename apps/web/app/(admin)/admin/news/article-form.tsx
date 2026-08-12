'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { copy } from '@ayman/contracts/copy/admin';
import type { AdminNewsDetail } from '@ayman/contracts/news';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody } from '@ayman/ui/components/card';
import { Field, FieldLabel } from '@ayman/ui/components/field';
import { Input } from '@ayman/ui/components/input';
import { Select } from '@ayman/ui/components/select';
import { Textarea } from '@ayman/ui/components/textarea';
import { createArticle, deleteArticle, patchArticle, setArticlePublished } from './actions';

/**
 * The article editor — one form for both creating and editing.
 *
 * ## Publishing is a separate button, not a field
 *
 * `status` is deliberately absent from the form. Publishing goes through its
 * own action and its own permission (`news:publish`), so an editor can fix a
 * typo on a live article without the save itself being the thing that decides
 * whether the world can see it. A `status` dropdown next to «احفظ» is exactly
 * how a half-finished draft ends up public.
 *
 * ## Errors are shown, never swallowed
 *
 * A duplicate slug comes back as a 409 and gets its own message, because
 * "حاول تاني" is useless advice for a problem the editor can actually fix.
 */
export interface CourseOption {
  id: string;
  title: string;
}

export function ArticleForm({
  article,
  courses,
}: {
  /** `null` when creating. */
  article: AdminNewsDetail | null;
  courses: readonly CourseOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [title, setTitle] = useState(article?.title ?? '');
  const [slug, setSlug] = useState(article?.slug ?? '');
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? '');
  const [body, setBody] = useState(article?.body ?? '');
  const [courseId, setCourseId] = useState(article?.relatedCourseId ?? '');

  const isPublished = article?.status === 'published';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);

    const input = {
      title,
      slug,
      excerpt,
      body,
      // '' is the "no course" option — the wire wants null, not an empty
      // string, and the contract rejects a non-uuid.
      relatedCourseId: courseId === '' ? null : courseId,
    };

    try {
      if (article) {
        await patchArticle(article.id, input);
        setSaved(true);
        startTransition(() => router.refresh());
      } else {
        const created = await createArticle(input);
        // Straight into the editor for the row that now exists, so the next
        // save is a PATCH rather than a second CREATE with the same slug.
        startTransition(() => router.replace(`/admin/news/${created.id}`));
      }
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message.includes('409')
          ? copy.adminNews.slugTaken
          : copy.adminNews.failed,
      );
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished() {
    if (!article || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setArticlePublished(article.id, !isPublished);
      startTransition(() => router.refresh());
    } catch {
      setError(copy.adminNews.failed);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!article || busy) return;
    // A destructive, irreversible action with no undo, so it asks first. A
    // native confirm is the honest minimum until this grows a real dialog —
    // the copy says «نهائي» for the same reason.
    if (!window.confirm(copy.adminNews.deleteConfirm)) return;
    setBusy(true);
    try {
      await deleteArticle(article.id);
      startTransition(() => router.replace('/admin/news'));
    } catch {
      setError(copy.adminNews.failed);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col gap-4">
          <Field name="title">
            <FieldLabel htmlFor="news-title">{copy.adminNews.fieldTitle}</FieldLabel>
            <Input
              id="news-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={120}
            />
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
              {copy.adminNews.fieldTitleHint}
            </p>
          </Field>

          <Field name="slug">
            <FieldLabel htmlFor="news-slug">{copy.adminNews.fieldSlug}</FieldLabel>
            <Input
              id="news-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              required
              maxLength={80}
              dir="auto"
            />
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
              {copy.adminNews.fieldSlugHint}
            </p>
          </Field>

          <Field name="excerpt">
            <FieldLabel htmlFor="news-excerpt">{copy.adminNews.fieldExcerpt}</FieldLabel>
            <Textarea
              id="news-excerpt"
              value={excerpt}
              onChange={(event) => setExcerpt(event.target.value)}
              required
              rows={2}
              // The same 160 the contract enforces. Stopping the typing is
              // kinder than accepting 300 characters and rejecting on submit.
              maxLength={160}
            />
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
              {copy.adminNews.fieldExcerptHint} — {excerpt.length}/160
            </p>
          </Field>

          <Field name="courseId">
            <FieldLabel htmlFor="news-course">{copy.adminNews.fieldCourse}</FieldLabel>
            <Select
              id="news-course"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
            >
              <option value="">{copy.adminNews.fieldCourseNone}</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </Select>
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
              {copy.adminNews.fieldCourseHint}
            </p>
          </Field>

          <Field name="body">
            <FieldLabel htmlFor="news-body">{copy.adminNews.fieldBody}</FieldLabel>
            <Textarea
              id="news-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
              rows={22}
              maxLength={40_000}
              // Markdown is written left-to-right in its syntax but the prose
              // is Arabic; `auto` lets the browser decide per line.
              dir="auto"
              className="font-mono text-[length:var(--fs-text-sm)]"
            />
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
              {copy.adminNews.fieldBodyHint}
            </p>
          </Field>
        </CardBody>
      </Card>

      {error ? (
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || pending}>
          {busy ? copy.adminNews.saving : copy.adminNews.save}
        </Button>

        {saved ? (
          <span className="text-[length:var(--fs-text-sm)] text-fg-muted">
            {copy.adminNews.saved}
          </span>
        ) : null}

        {article ? (
          <>
            {/*
              Labelled with the ACT, not the state: «انشر المقالة» when it is a
              draft, «شيلها من النشر» when it is live. A button labelled with
              its current state is the classic way an admin clicks the opposite
              of what they meant.
            */}
            <Button
              type="button"
              variant="secondary"
              onClick={togglePublished}
              disabled={busy || pending}
            >
              {busy
                ? copy.adminNews.publishing
                : isPublished
                  ? copy.adminNews.unpublish
                  : copy.adminNews.publish}
            </Button>

            <Button
              type="button"
              variant="danger"
              onClick={remove}
              disabled={busy || pending}
              className="ms-auto"
            >
              {copy.adminNews.delete}
            </Button>
          </>
        ) : null}
      </div>
    </form>
  );
}
