'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Download, FileDown, Share2 } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { lalezar, ruqaa } from '@/lib/fonts';
import { canvasToBlob, loadFonts, loadImage, resolveFonts, type CardFonts } from '@/lib/share-card/canvas-kit';
import { jpegToPdf } from '@/lib/share-card/pdf';

const c = copy.shareCard;

export interface ShareCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Without extension — `.png` / `.pdf` is added per button. */
  fileName: string;
  heroSrc?: string;
  /** The teacher's signature for this design, if one was uploaded. */
  signatureSrc?: string;
  /** Also offer the image wrapped as a one-page PDF (the certificate). */
  pdf?: boolean;
  draw: (
    canvas: HTMLCanvasElement,
    fonts: CardFonts,
    hero: HTMLImageElement | undefined,
    signature: HTMLImageElement | undefined,
  ) => void;
}

/** `null` while drawing; set once, asynchronously, when the image is ready or failed. */
type Outcome = { kind: 'ready'; url: string; blob: Blob } | { kind: 'failed' };

/**
 * Draws the image when the dialog opens, shows it, and hands it over three
 * ways: the system share sheet (straight into Instagram/TikTok on a phone), a
 * PNG download, and — for the certificate — a PDF.
 *
 * Drawn on open and not before: the display faces and the hero art are a few
 * hundred KB the result page has no other use for, and most students never
 * press the button.
 */
export function ShareCardDialog({
  open,
  onOpenChange,
  title,
  fileName,
  heroSrc,
  signatureSrc,
  pdf,
  draw,
}: ShareCardDialogProps) {
  const fontsRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const state = outcome ?? { kind: 'rendering' as const };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      const host = fontsRef.current;
      if (!host) throw new Error('font host not mounted');
      const fonts = resolveFonts(host);
      // A failed hero is not a failed card: the card has its own fire for that.
      // Same for the signature: without it the name is set in the script face.
      const [, hero, signature] = await Promise.all([
        loadFonts(fonts),
        heroSrc ? loadImage(heroSrc).catch(() => undefined) : undefined,
        signatureSrc ? loadImage(signatureSrc).catch(() => undefined) : undefined,
      ]);
      const canvas = document.createElement('canvas');
      draw(canvas, fonts, hero, signature);
      const blob = await canvasToBlob(canvas, 'image/png');
      if (cancelled) return;
      canvasRef.current = canvas;
      url = URL.createObjectURL(blob);
      setOutcome({ kind: 'ready', url, blob });
    })().catch(() => {
      if (!cancelled) setOutcome({ kind: 'failed' });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, heroSrc, signatureSrc, draw]);

  const file = useMemo(
    () => (outcome?.kind === 'ready' ? new File([outcome.blob], `${fileName}.png`, { type: 'image/png' }) : null),
    [outcome, fileName],
  );
  const canShare =
    file !== null && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  const share = useCallback(async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file] });
    } catch {
      // Dismissing the share sheet rejects; that is not an error to show.
    }
  }, [file]);

  const downloadPdf = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const jpeg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
    const bytes = jpegToPdf(jpeg, canvas.width, canvas.height);
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
    save(url, `${fileName}.pdf`);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [fileName]);

  return (
    <>
      {/* Carries the display faces' variables so `resolveFonts` can read
          their real (hashed) family names. Never painted — and OUTSIDE the
          dialog, because the dialog's content mounts in a portal after `open`
          flips, later than the effect that needs this. */}
      <div ref={fontsRef} className={`${lalezar.variable} ${ruqaa.variable}`} hidden />
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Cleared on close, in the event — not in the effect — so the next
          // open starts at «drawing» instead of flashing the previous image.
          if (!next) setOutcome(null);
          onOpenChange(next);
        }}
      >
        <DialogContent closeLabel={c.close} className="share-card-dialog">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{c.dialogHint}</DialogDescription>
          </DialogHeader>

          <div className="share-card-dialog__stage" data-state={state.kind}>
            {state.kind === 'ready' ? (
              <img src={state.url} alt={title} className="share-card-dialog__img" />
            ) : (
              <p className="share-card-dialog__status">{state.kind === 'failed' ? c.failed : c.rendering}</p>
            )}
          </div>

          <Actions>
            {canShare ? (
              <Button onClick={share} disabled={state.kind !== 'ready'}>
                <Share2 className="size-4" aria-hidden="true" />
                {c.share}
              </Button>
            ) : null}
            <Button
              variant={canShare ? 'secondary' : 'primary'}
              disabled={state.kind !== 'ready'}
              onClick={() => state.kind === 'ready' && save(state.url, `${fileName}.png`)}
            >
              <Download className="size-4" aria-hidden="true" />
              {c.download}
            </Button>
            {pdf ? (
              <Button variant="secondary" disabled={state.kind !== 'ready'} onClick={downloadPdf}>
                <FileDown className="size-4" aria-hidden="true" />
                {c.downloadPdf}
              </Button>
            ) : null}
          </Actions>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-center gap-2">{children}</div>;
}

function save(url: string, name: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}
