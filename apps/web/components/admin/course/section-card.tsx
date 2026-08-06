'use client';

import { useActionState } from 'react';
import { copy } from '@ayman/contracts';
import { Badge, Button, Input, Label } from '@ayman/ui';
import {
  type ActionResult,
  createSectionAction,
  setSectionPublishedAction,
} from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { SortableLessonList } from './lesson-list';
import { AddLessonForm, LessonPanel } from './lesson-panel';
import { ActionError, IDLE } from './action-state';

type Section = AdminCourseDetail['sections'][number];

/** One section of a course, with its lessons. */
export function SectionCard({ courseId, section }: { courseId: string; section: Section }) {
  const [toggleState, toggleAction, togglePending] = useActionState<ActionResult, FormData>(
    () => setSectionPublishedAction(courseId, section.id, !section.isPublished),
    IDLE,
  );

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium text-fg">{section.title}</h3>
          {section.summary ? <p className="text-fg-muted">{section.summary}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={section.isPublished ? 'accent' : 'neutral'}>
            {section.isPublished ? copy.admin.course.statusPublished : copy.admin.course.statusDraft}
          </Badge>
          <form action={toggleAction}>
            <Button type="submit" variant="ghost" size="sm" disabled={togglePending}>
              {section.isPublished ? copy.admin.course.unpublish : copy.admin.course.publish}
            </Button>
          </form>
        </div>
      </div>
      <ActionError state={toggleState} />

      {section.lessons.length === 0 ? (
        <p className="text-fg-muted">{copy.admin.lesson.empty}</p>
      ) : (
        <SortableLessonList
          // Remounts (and re-seeds the debounce hook's local order) only
          // when the lesson SET changes — adding/removing a lesson — never
          // on a pure reorder, which is the hook's own concern.
          key={section.lessons.map((lesson) => lesson.id).join(',')}
          courseId={courseId}
          sectionId={section.id}
          lessons={section.lessons}
          renderDetails={(lesson) => <LessonPanel courseId={courseId} lesson={lesson} />}
        />
      )}

      <AddLessonForm courseId={courseId} sectionId={section.id} />
    </div>
  );
}

export function AddSectionForm({ courseId }: { courseId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) =>
      createSectionAction(courseId, String(formData.get('title') ?? '')),
    IDLE,
  );

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-2">
      <div className="min-w-[16rem] flex-1">
        <Label htmlFor={`new-section-${courseId}`}>{copy.admin.section.title}</Label>
        <Input id={`new-section-${courseId}`} name="title" required />
      </div>
      <Button type="submit" disabled={pending}>
        {copy.admin.section.new}
      </Button>
      <ActionError state={state} />
    </form>
  );
}
