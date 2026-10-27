'use client';

import { useState } from 'react';
import { ImageDown } from 'lucide-react';
import { ShareCardDialog } from '@/components/share-card/share-card-dialog';
import { drawRecapStory, type RecapStoryInput } from '@/lib/engagement/draw-recap';

/**
 * «صورة للستوري» — the recap drawn on a client canvas, through the same
 * dialog the result card and the certificates use (download, native share).
 * Everything printed arrives resolved from the server page.
 */
export function RecapShare({
  label,
  title,
  fileName,
  input,
}: {
  label: string;
  title: string;
  fileName: string;
  input: Omit<RecapStoryInput, 'fonts'>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="eg-btn eg-btn--solid eg-btn--lg" onClick={() => setOpen(true)}>
        <ImageDown className="size-4" aria-hidden="true" />
        {label}
      </button>
      <ShareCardDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        fileName={fileName}
        draw={(canvas, fonts) => drawRecapStory(canvas, { ...input, fonts })}
      />
    </>
  );
}
