'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { Check, Copy, FileUp } from 'lucide-react';
import {
  PDF_CATEGORIES,
  pdfSizeLabel,
  type AdminPdfDetail,
  type PdfCategory,
  type PdfYear,
} from '@ayman/contracts/pdfs';
import { pdfsCopy } from '@ayman/contracts/copy/pdfs';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody } from '@ayman/ui/components/card';
import { Field, FieldLabel } from '@ayman/ui/components/field';
import { Input } from '@ayman/ui/components/input';
import { Select } from '@ayman/ui/components/select';
import { Textarea } from '@ayman/ui/components/textarea';
import { MediaKeyField } from '@/components/admin/media-key-field';
import { uploadDocument } from '@/lib/upload-client';
import { createPdf, deletePdf, patchPdf, setPdfPublished } from './actions';

const c = pdfsCopy.admin;

interface UploadedFile {
  fileKey: string;
  fileName: string;
  sizeBytes: number;
}

/**
 * The PDF editor — create and edit, the article editor's shape.
 *
 * The file goes up FIRST and on its own (`uploadDocument`, straight to the API
 * with a progress bar — a Server Action dies silently at 1 MB), and the form
 * then saves only the key it got back. Publishing is its own button and its
 * own permission, exactly as for an article: a save never decides on its own
 * that the world can see a half-finished page.
 *
 * Once saved, the two links are on the screen with a copy button each: the
 * page (what goes under a YouTube video and what ranks) and the direct file.
 */
export function PdfForm({ pdf, siteUrl }: { pdf: AdminPdfDetail | null; siteUrl: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [title, setTitle] = useState(pdf?.title ?? '');
  const [slug, setSlug] = useState(pdf?.slug ?? '');
  const [description, setDescription] = useState(pdf?.description ?? '');
  const [body, setBody] = useState(pdf?.body ?? '');
  const [category, setCategory] = useState<PdfCategory>(pdf?.category ?? 'summary');
  const [year, setYear] = useState<string>(pdf?.year ? String(pdf.year) : '');
  const [pageCount, setPageCount] = useState(pdf?.pageCount ? String(pdf.pageCount) : '');
  const [coverKey, setCoverKey] = useState<string | null>(pdf?.coverKey ?? null);
  const [file, setFile] = useState<UploadedFile | null>(
    pdf ? { fileKey: pdf.fileKey, fileName: pdf.fileName, sizeBytes: pdf.sizeBytes } : null,
  );
  const [progress, setProgress] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const isPublished = pdf?.status === 'published';

  async function pickFile(picked: File | undefined) {
    if (!picked) return;
    setError(null);
    setProgress(0);
    const outcome = await uploadDocument(picked, setProgress);
    setProgress(null);
    if (!outcome.ok || !outcome.value.storageKey.endsWith('.pdf')) {
      setError(c.uploadFailed);
      return;
    }
    setFile({
      fileKey: outcome.value.storageKey,
      fileName: outcome.value.filename,
      sizeBytes: outcome.value.sizeBytes,
    });
    // A new file with no title yet: start from its name, minus the extension.
    if (title.trim() === '') setTitle(outcome.value.filename.replace(/\.pdf$/i, ''));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!file) {
      setError(c.fileMissing);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);

    const input = {
      title,
      slug,
      description,
      body,
      category,
      year: (year === '' ? null : Number(year)) as PdfYear,
      coverKey,
      fileKey: file.fileKey,
      fileName: file.fileName,
      sizeBytes: file.sizeBytes,
      pageCount: pageCount === '' ? null : Number(pageCount),
    };

    try {
      if (pdf) {
        await patchPdf(pdf.id, input);
        setSaved(true);
        startTransition(() => router.refresh());
      } else {
        const created = await createPdf(input);
        startTransition(() => router.replace(`/admin/pdfs/${created.id}`));
      }
    } catch (caught) {
      setError(caught instanceof Error && caught.message.includes('409') ? c.slugTaken : c.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished() {
    if (!pdf || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setPdfPublished(pdf.id, !isPublished);
      startTransition(() => router.refresh());
    } catch {
      setError(c.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!pdf || busy) return;
    if (!window.confirm(c.deleteConfirm)) return;
    setBusy(true);
    try {
      await deletePdf(pdf.id);
      startTransition(() => router.replace('/admin/pdfs'));
    } catch {
      setError(c.saveFailed);
      setBusy(false);
    }
  }

  const pageUrl = pdf && siteUrl ? `${siteUrl}/pdfs/${encodeURIComponent(pdf.slug)}` : null;
  const downloadUrl = pdf && siteUrl ? `${siteUrl}/api/pdfs/${encodeURIComponent(pdf.slug)}/download` : null;

  return (
    <form method="post" onSubmit={submit} className="flex flex-col gap-4">
      {pageUrl && downloadUrl && isPublished ? (
        <Card>
          <CardBody className="flex flex-col gap-3">
            <p className="font-medium text-fg">{c.links}</p>
            <CopyRow label={c.pageLink} value={pageUrl} />
            <CopyRow label={c.downloadLink} value={downloadUrl} />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody className="flex flex-col gap-4">
          <Field name="file">
            <FieldLabel htmlFor="pdf-file">{c.fieldFile}</FieldLabel>
            <div className="flex flex-wrap items-center gap-3 rounded-[var(--r-md)] border border-dashed border-line-strong p-4">
              <FileUp className="size-5 text-fg-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {file ? (
                  <p className="truncate text-fg" dir="auto">
                    {file.fileName} · {pdfSizeLabel(file.sizeBytes)}
                  </p>
                ) : (
                  <p className="text-fg-muted">{c.fieldFileHint}</p>
                )}
                {progress !== null ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                ) : null}
              </div>
              <input
                ref={fileInput}
                id="pdf-file"
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(event) => void pickFile(event.target.files?.[0])}
              />
              <Button type="button" variant="secondary" disabled={progress !== null} onClick={() => fileInput.current?.click()}>
                {progress !== null ? c.uploading : file ? c.replace : c.upload}
              </Button>
            </div>
          </Field>

          <Field name="title">
            <FieldLabel htmlFor="pdf-title">{c.fieldTitle}</FieldLabel>
            <Input id="pdf-title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={120} />
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.fieldTitleHint}</p>
          </Field>

          <Field name="slug">
            <FieldLabel htmlFor="pdf-slug">{c.fieldSlug}</FieldLabel>
            <Input id="pdf-slug" value={slug} onChange={(event) => setSlug(event.target.value)} required maxLength={80} dir="auto" />
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.fieldSlugHint}</p>
          </Field>

          <Field name="description">
            <FieldLabel htmlFor="pdf-description">{c.fieldDescription}</FieldLabel>
            <Textarea
              id="pdf-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              rows={2}
              maxLength={160}
            />
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
              {c.fieldDescriptionHint} — {description.length}/160
            </p>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="category">
              <FieldLabel htmlFor="pdf-category">{c.fieldCategory}</FieldLabel>
              <Select id="pdf-category" value={category} onChange={(event) => setCategory(event.target.value as PdfCategory)}>
                {PDF_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {pdfsCopy.category[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field name="year">
              <FieldLabel htmlFor="pdf-year">{c.fieldYear}</FieldLabel>
              <Select id="pdf-year" value={year} onChange={(event) => setYear(event.target.value)}>
                <option value="">{c.fieldYearBoth}</option>
                <option value="1">{pdfsCopy.year[1]}</option>
                <option value="2">{pdfsCopy.year[2]}</option>
              </Select>
            </Field>
            <Field name="pageCount">
              <FieldLabel htmlFor="pdf-pages">{c.fieldPages}</FieldLabel>
              <Input
                id="pdf-pages"
                type="number"
                inputMode="numeric"
                min={1}
                max={5000}
                value={pageCount}
                onChange={(event) => setPageCount(event.target.value)}
              />
            </Field>
          </div>

          <MediaKeyField
            name="coverKey"
            id="pdf-cover"
            label={c.fieldCover}
            defaultValue={coverKey}
            shape="book"
            onChange={setCoverKey}
          />

          <Field name="body">
            <FieldLabel htmlFor="pdf-body">{c.fieldBody}</FieldLabel>
            <Textarea
              id="pdf-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={12}
              maxLength={20_000}
              dir="auto"
              className="font-mono text-[length:var(--fs-text-sm)]"
            />
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.fieldBodyHint}</p>
          </Field>
        </CardBody>
      </Card>

      {error ? (
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || pending || progress !== null}>
          {busy ? c.saving : c.save}
        </Button>
        {saved ? <span className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.saved}</span> : null}
        {pdf ? (
          <>
            <Button type="button" variant={isPublished ? 'secondary' : 'primary'} disabled={busy} onClick={togglePublished}>
              {isPublished ? c.unpublish : c.publish}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={remove} className="ms-auto">
              {c.delete}
            </Button>
          </>
        ) : null}
      </div>
    </form>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-full text-[length:var(--fs-text-xs)] text-fg-muted sm:w-48">{label}</span>
      <code
        dir="ltr"
        className="min-w-0 flex-1 truncate rounded-[var(--r-sm)] bg-surface-3 px-2 py-1.5 text-[length:var(--fs-text-xs)] text-fg"
        style={{ unicodeBidi: 'isolate' }}
      >
        {decodeURI(value)}
      </code>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        {copied ? c.copied : c.copy}
      </Button>
    </div>
  );
}
