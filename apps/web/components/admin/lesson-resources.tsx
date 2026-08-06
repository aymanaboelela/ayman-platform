'use client';

import { useActionState, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { copy, type LessonResourceKind } from '@ayman/contracts';
import { ALLOWED_DOCUMENT_EXT } from '@ayman/contracts/admin/media';
import { Button, Input, Label, Select, Textarea, cn } from '@ayman/ui';
import {
  addResourceAction,
  removeResourceAction,
  reorderResourcesAction,
  updateResourceAction,
  uploadResourceDocumentAction,
  type ActionResult,
  type AddResourceInput,
  type UploadedDocument,
} from '@/app/(admin)/admin/courses/actions';
import { SortableList, type SortableHandleProps } from './sortable-list';

const c = copy.admin.resource;
const IDLE: ActionResult = { ok: true };
const ACCEPT = ALLOWED_DOCUMENT_EXT.map((ext) => `.${ext}`).join(',');

/** The row shape the course editor already loads per lesson. */
export interface AdminResource {
  id: string;
  kind: LessonResourceKind;
  title: string;
  description: string | null;
  filename: string | null;
  linkUrl: string | null;
  videoExternalId: string | null;
}

const KIND_LABEL: Record<LessonResourceKind, string> = {
  presentation: c.kindPresentation,
  video: c.kindVideo,
  document: c.kindDocument,
  link: c.kindLink,
};

/** What each row shows underneath its title, so the admin can tell two
 *  same-named resources apart without opening anything. */
function subtitleOf(resource: AdminResource): string | null {
  if (resource.filename !== null) return resource.filename;
  if (resource.linkUrl !== null) return resource.linkUrl;
  if (resource.videoExternalId !== null) return resource.videoExternalId;
  return null;
}

function ActionError({ state }: { state: ActionResult }) {
  if (state.ok) return null;
  return (
    <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
      {state.message}
    </p>
  );
}

/**
 * One material: drag handle, kind, title and subtitle, then edit and delete.
 *
 * Editing is title and description ONLY — `LessonResourceUpdateSchema` accepts
 * nothing else, and the kind stays fixed for the reason this file's header
 * gives: turning a link into a file would null three columns and populate
 * four, which is a create wearing a costume.
 */
function ResourceRow({
  courseId,
  resource,
  handleProps,
}: {
  courseId: string;
  resource: AdminResource;
  handleProps: SortableHandleProps;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const subtitle = subtitleOf(resource);

  async function save(formData: FormData) {
    const title = String(formData.get('title') ?? '').trim();
    const rawDescription = String(formData.get('description') ?? '').trim();
    if (title.length < 2) return;
    setPending(true);
    const result = await updateResourceAction(courseId, resource.id, {
      title,
      description: rawDescription.length > 0 ? rawDescription : null,
    });
    setPending(false);
    if (result.ok) {
      setEditing(false);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  if (editing) {
    return (
      <form action={save} className="space-y-2 rounded-md border border-line bg-surface-2 p-3">
        <div>
          <Label htmlFor={`edit-title-${resource.id}`}>{c.resourceTitle}</Label>
          <Input
            id={`edit-title-${resource.id}`}
            name="title"
            defaultValue={resource.title}
            required
            minLength={2}
          />
        </div>
        <div>
          <Label htmlFor={`edit-desc-${resource.id}`}>{c.description}</Label>
          <Textarea
            id={`edit-desc-${resource.id}`}
            name="description"
            rows={2}
            defaultValue={resource.description ?? ''}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {c.save}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>
            {c.cancel}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
      <button
        type="button"
        aria-label={copy.admin.reorder.handle}
        className="cursor-grab rounded-xs px-1 py-1 text-fg-muted focus-visible:outline-2"
        {...handleProps.attributes}
        {...handleProps.listeners}
      >
        <span aria-hidden="true" className="block h-px w-4 bg-current" />
        <span aria-hidden="true" className="mt-1 block h-px w-4 bg-current" />
      </button>

      <span className="mono shrink-0 text-[length:var(--fs-mono-label)] text-fg-muted">
        {KIND_LABEL[resource.kind]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--fs-text-sm)] text-fg">
          {resource.title}
        </span>
        {subtitle === null ? null : (
          <span className="mono block truncate text-[length:var(--fs-mono-label)] text-fg-muted">
            {subtitle}
          </span>
        )}
      </span>

      <span className="row-actions">
        <button type="button" className="chip chip--quiet" onClick={() => setEditing(true)}>
          {c.edit}
        </button>
        <span aria-hidden="true" className="row-actions__sep" />
        <form
          action={async () => {
            const result = await removeResourceAction(courseId, resource.id);
            if (result.ok) router.refresh();
            else toast.error(result.message);
          }}
        >
          <button type="submit" className="chip chip--danger">
            {c.remove}
          </button>
        </form>
      </span>
    </div>
  );
}

/**
 * The admin's materials panel for ONE lesson, rendered for every lesson kind.
 *
 * Editing a resource's kind is deliberately not offered: a PATCH that turned a
 * link into a file would have to null three columns and populate four, which
 * is a create wearing a costume. Delete and re-add instead — the same reason
 * `LessonResourceUpdateSchema` only accepts title and description.
 */
export function LessonResources({
  courseId,
  lessonId,
  resources,
}: {
  courseId: string;
  lessonId: string;
  resources: AdminResource[];
}) {
  const [kind, setKind] = useState<LessonResourceKind>('presentation');
  const [uploaded, setUploaded] = useState<UploadedDocument | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The database enforces this with a partial unique index; disabling the
  // option here only means the admin learns the rule before a 500 tells them.
  const hasPresentation = resources.some((resource) => resource.kind === 'presentation');
  const isFileKind = kind === 'presentation' || kind === 'document';

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) => {
      const title = String(formData.get('title') ?? '');
      const rawDescription = String(formData.get('description') ?? '');
      const description = rawDescription.length > 0 ? rawDescription : null;

      let input: AddResourceInput;
      if (kind === 'presentation' || kind === 'document') {
        if (uploaded === null) return { ok: false, message: c.file };
        input = { kind, title, description, ...uploaded };
      } else if (kind === 'video') {
        input = {
          kind: 'video',
          title,
          description,
          provider: 'youtube',
          url: String(formData.get('url') ?? ''),
        };
      } else {
        input = { kind: 'link', title, description, linkUrl: String(formData.get('linkUrl') ?? '') };
      }

      const result = await addResourceAction(courseId, lessonId, input);
      if (result.ok) {
        setUploaded(null);
        if (fileRef.current) fileRef.current.value = '';
      }
      return result;
    },
    IDLE,
  );

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const result = await uploadResourceDocumentAction(body);
      if (result.ok) {
        setUploaded(result.document);
      } else {
        toast.error(c.uploadFailed);
        if (fileRef.current) fileRef.current.value = '';
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="mt-4 border-t border-line-subtle pt-4">
      <div className="mb-1 flex items-baseline gap-2">
        <h4 className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.title}</h4>
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.hint}</p>
      </div>

      {resources.length === 0 ? (
        <p className="mb-3 text-[length:var(--fs-text-sm)] text-fg-muted">{c.empty}</p>
      ) : (
        <div className="mb-3">
          {/*
            `reorderResourcesAction` has existed since the resources endpoint
            shipped and had no caller — materials rendered as a plain <ul> and
            their order could only be changed by deleting and re-adding.
          */}
          <SortableList
            key={resources.map((resource) => resource.id).join(',')}
            items={resources}
            onReorder={(orderedIds) => reorderResourcesAction(courseId, lessonId, orderedIds)}
            renderItem={(resource, handleProps) => (
              <ResourceRow
                courseId={courseId}
                resource={resource}
                handleProps={handleProps}
              />
            )}
            announcements={{
              pickedUp: (position) => `${copy.admin.reorder.pickedUpResource} ${position}`,
              movedOver: (position) => `${copy.admin.reorder.movedOver} ${position}`,
              dropped: (position) => `${copy.admin.reorder.dropped} ${position}`,
              cancelled: copy.admin.reorder.cancelled,
            }}
          />
        </div>
      )}

      <form action={formAction} className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44">
            <Label htmlFor={`res-kind-${lessonId}`}>{c.kind}</Label>
            <Select
              id={`res-kind-${lessonId}`}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as LessonResourceKind);
                setUploaded(null);
              }}
            >
              <option value="presentation" disabled={hasPresentation}>
                {c.kindPresentation}
              </option>
              <option value="video">{c.kindVideo}</option>
              <option value="document">{c.kindDocument}</option>
              <option value="link">{c.kindLink}</option>
            </Select>
          </div>

          <div className="min-w-[12rem] flex-1">
            <Label htmlFor={`res-title-${lessonId}`}>{c.resourceTitle}</Label>
            <Input id={`res-title-${lessonId}`} name="title" required />
          </div>
        </div>

        {hasPresentation && kind === 'presentation' ? (
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.onePresentationOnly}</p>
        ) : null}

        {isFileKind ? (
          <div>
            <Label htmlFor={`res-file-${lessonId}`}>{c.file}</Label>
            <input
              ref={fileRef}
              id={`res-file-${lessonId}`}
              type="file"
              accept={ACCEPT}
              className={cn(
                'block w-full rounded-sm border border-line bg-surface-2 px-3 py-2',
                'text-[length:var(--fs-text-sm)] text-fg',
              )}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
              {uploading ? c.uploading : (uploaded?.filename ?? c.fileHint)}
            </p>
          </div>
        ) : null}

        {kind === 'video' ? (
          <div>
            <Label htmlFor={`res-url-${lessonId}`}>{c.videoUrl}</Label>
            <Input id={`res-url-${lessonId}`} name="url" required />
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
              {copy.admin.lesson.videoUrlHint}
            </p>
          </div>
        ) : null}

        {kind === 'link' ? (
          <div>
            <Label htmlFor={`res-link-${lessonId}`}>{c.linkUrl}</Label>
            <Input id={`res-link-${lessonId}`} name="linkUrl" type="url" required />
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.linkUrlHint}</p>
          </div>
        ) : null}

        <div>
          <Label htmlFor={`res-desc-${lessonId}`}>{c.description}</Label>
          <Textarea id={`res-desc-${lessonId}`} name="description" rows={2} />
        </div>

        <Button type="submit" size="sm" disabled={pending || uploading || (isFileKind && !uploaded)}>
          {c.add}
        </Button>
        <ActionError state={state} />
      </form>
    </section>
  );
}
