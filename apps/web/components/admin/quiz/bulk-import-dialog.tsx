'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { copy, formatCopy, parseQuestionBlocks, type ImportResult } from '@ayman/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
  Select,
  Textarea,
} from '@ayman/ui';
import { apiPost } from '@/lib/api';
import { RichText } from '@/components/content/rich-text';

const BulkCommitResultSchema = z.object({ created: z.number() });

export interface BulkImportDialogProps {
  categories: { id: string; name: string }[];
  onCommitted?: () => void;
}

const EXAMPLE = `سؤال ١: عاصمة مصر إيه؟
A. القاهرة
B. الإسكندرية
C. أسوان
ANSWER: A

سؤال ٢: النيل بيجري من الجنوب للشمال
TYPE: true
A. صح
B. خطأ
ANSWER: A`;

/**
 * `parseQuestionBlocks` runs in the BROWSER on every change (debounced), so
 * the instructor sees the parsed type/stem/answer per block before
 * committing. This preview is a convenience only — the API re-parses the
 * same text server-side and is the actual validation.
 */
export function BulkImportDialog({ categories, onCommitted }: BulkImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [text, setText] = useState('');
  const [debouncedText, setDebouncedText] = useState('');
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedText(text), 250);
    return () => clearTimeout(timer);
  }, [text]);

  const result: ImportResult | null = useMemo(() => {
    if (debouncedText.trim().length === 0) return null;
    return parseQuestionBlocks(debouncedText, categoryId);
  }, [debouncedText, categoryId]);

  const hasErrors = (result?.errors.length ?? 0) > 0;

  async function commit() {
    setCommitting(true);
    try {
      const response = await apiPost('/api/admin/questions/bulk', BulkCommitResultSchema, {
        categoryId,
        text,
      });
      toast.success(formatCopy(copy.quizAdmin.bulkImportPreview, { n: response.created }));
      setOpen(false);
      setText('');
      onCommitted?.();
    } catch {
      toast.error(copy.admin.common.saveFailed);
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          {copy.quizAdmin.bulkImport}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.close} className="max-w-[820px]">
        <DialogHeader>
          <DialogTitle>{copy.quizAdmin.bulkImport}</DialogTitle>
        </DialogHeader>

        <div className="mb-4">
          <Label htmlFor="bulk-import-category">{copy.quizAdmin.category}</Label>
          <Select id="bulk-import-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{copy.quizAdmin.bulkImportHint}</p>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="min-h-72 font-mono"
              dir="rtl"
              aria-label={copy.quizAdmin.bulkImport}
            />
            <pre className="overflow-x-auto rounded-sm border border-line-subtle bg-surface-3 p-3 text-[length:var(--fs-mono-label)] text-fg-muted" dir="ltr">
              {EXAMPLE}
            </pre>
          </div>

          <div className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto">
            {result ? (
              <>
                <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
                  {formatCopy(copy.quizAdmin.bulkImportPreview, { n: result.questions.length })}
                </p>
                {result.errors.map((error) => (
                  <p
                    key={`${error.blockIndex}-${error.line}`}
                    role="alert"
                    className="flex items-baseline gap-2 text-[length:var(--fs-text-sm)] text-err"
                  >
                    <span className="mono shrink-0">#{error.blockIndex}</span>
                    <span>{error.message}</span>
                  </p>
                ))}
                {result.questions.map((question, index) => (
                  <div key={index} className="rounded-sm border border-line-subtle bg-surface-2 p-2">
                    <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
                      {copy.quizAdmin.types[question.type]}
                    </p>
                    <RichText html={question.stemHtml} className="text-[length:var(--fs-text-sm)] text-fg" />
                  </div>
                ))}
              </>
            ) : (
              <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{copy.common.empty}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {copy.admin.common.cancel}
          </Button>
          <Button type="button" onClick={commit} disabled={!result || hasErrors || committing || !categoryId}>
            {copy.quizAdmin.bulkImportCommit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
