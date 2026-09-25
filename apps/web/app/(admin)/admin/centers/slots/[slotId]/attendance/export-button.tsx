'use client';

import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';
import { ROW_BUTTON, ROW_BUTTON_TONE, tone } from '../../../centers-ui';

const c = copy.admin.centers.sheet;

/**
 * «تحميل Excel» — the sheet as a CSV built on the server and handed over
 * whole, so this component is a Blob and a click and nothing else.
 *
 * CSV rather than `.xlsx`: Excel opens it straight away, and an xlsx writer is
 * a few hundred KB of client code for one button. The leading BOM is the part
 * that matters — without it Excel reads the file as the machine's ANSI code
 * page and every Arabic name arrives as «Ø§Ù„…».
 */
export function ExportSheetButton({ csv, filename }: { csv: string; filename: string }) {
  function download() {
    if (csv === '') {
      toast.error(c.exportEmpty);
      return;
    }
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoked on the next task, not synchronously: Safari starts the download
    // after `click()` returns and a URL revoked in between downloads nothing.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <button
      type="button"
      onClick={download}
      style={tone('var(--ok)')}
      className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'md:h-10')}
    >
      <Download className="size-4" aria-hidden="true" />
      {c.export}
    </button>
  );
}
