'use client';

import { useActionState, useRef, useState } from 'react';
import { toast } from 'sonner';
import { copy, type LessonResourceKind } from '@ayman/contracts';
import { ALLOWED_DOCUMENT_EXT } from '@ayman/contracts/admin/media';
import { Button, Input, Label, Select, Textarea, cn } from '@ayman/ui';
import {
  addResourceAction,
  removeResourceAction,
  uploadResourceDocumentAction,
  type ActionResult,
  type AddResourceInput,
  type UploadedDocument,
} from '@/app/(admin)/admin/courses/actions';

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
        <ul className="mb-3 overflow-hidden rounded-md border border-line">
          {resources.map((resource) => {
            const subtitle = subtitleOf(resource);
            return (
              <li
                key={resource.id}
                className="flex items-center gap-3 border-b border-line-subtle px-3 py-2 last:border-b-0"
              >
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
                <form
                  action={async () => {
                    const result = await removeResourceAction(courseId, resource.id);
                    if (!result.ok) toast.error(result.message);
                  }}
                >
                  <Button type="submit" size="sm" variant="ghost">
                    {c.remove}
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
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
