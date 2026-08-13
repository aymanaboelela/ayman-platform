'use client';

import { useEffect, useRef, useState } from 'react';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.admin.media;

/**
 * The longest edge of the exported image.
 *
 * A course cover is rendered at 288px in the admin, ~420px on a card and full
 * bleed on the course page — 1600 covers all three on a 2× display with room
 * to spare, and the API re-encodes to WebP afterwards anyway. It is a CEILING,
 * never a target: the export never upscales past the pixels the crop actually
 * contains, because inventing pixels makes a file bigger and an image no
 * sharper.
 */
const MAX_OUTPUT_WIDTH = 1600;

/** Zoom is relative to "just covers the frame", so 1 is always a valid state. */
const MAX_ZOOM = 4;

type Offset = { x: number; y: number };

/**
 * Crop and reposition an image before it is uploaded.
 *
 * ## Why the crop happens in the BROWSER, and the cropped file is what ships
 *
 * The alternative was storing a focal point or a crop rectangle on the course
 * and applying it at render time. That means a migration, a new column every
 * reader has to know about, and six call sites — the card, the library grid,
 * the dashboard, the path map, the course page and the OG image — each having
 * to agree on how to interpret it. Miss one and that surface shows a different
 * crop from the rest.
 *
 * Cropping here means the STORED image is the final image: every reader keeps
 * rendering a plain `<img>` and cannot disagree, and nothing on the server
 * changes at all — the same allowlist, the same magic-byte sniff, the same
 * sharp re-encode, the same UUID key.
 *
 * The cost is that the original is not kept, so re-cropping means picking the
 * file again. That is the honest trade for not putting a crop rectangle into
 * six renderers, and the instructor still has the file on their machine.
 *
 * ## Why a slider and not pinch-to-zoom
 *
 * A slider works with a mouse, a finger and a keyboard. Pinch works with two
 * fingers and nothing else — it cannot be reached from a keyboard at all, and
 * this is a staff tool that has to be operable on a laptop. Dragging to
 * reposition is the one gesture that is genuinely better direct.
 *
 * ## Why the image can never be dragged off the frame
 *
 * The position is stored as a FRACTION of the travel available on each axis,
 * not as pixels, so "outside the frame" is not a state this component can
 * represent. A crop that let a corner go empty would produce a cover with a
 * transparent — or, after the WebP encode, black — wedge in it, and the person
 * cropping could not see the wedge, because the frame is showing them the
 * picture rather than the gap beside it.
 */
export function CoverCropper({
  file,
  aspect,
  onCancel,
  onCropped,
  onUseOriginal,
}: {
  file: File;
  /**
   * Width ÷ height of the frame. 16/9 for a cover and a lesson poster, 1 for a
   * favicon, 1.91 for a share card.
   *
   * `'source'` means "whatever this picture already is" — the frame takes the
   * image's own ratio, so at zoom 1 the crop is a no-op and the only thing on
   * offer is zooming in. That is the honest option for a LOGO, which has no
   * canonical shape: forcing one into a square would either letterbox it or
   * cut the wordmark off, and both are worse than leaving it alone.
   */
  aspect: number | 'source';
  onCancel: () => void;
  onCropped: (cropped: File) => void;
  /** Skips the crop entirely and uploads what was picked. */
  onUseOriginal: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  /*
   * WHERE the frame sits on the picture, as a fraction of the pannable range
   * on each axis — 0 is hard against the start/top edge, 1 against the
   * end/bottom, 0.5 dead centre. Not pixels.
   *
   * Pixels needed an effect to re-clamp them every time the geometry changed
   * (a zoom, a resize, the image finishing its decode), and that effect called
   * `setState` synchronously — which `react-hooks` rejects, correctly: it is a
   * second render triggered by the first, and the intermediate state is
   * briefly WRONG (the picture pulled off one edge with a gap behind it).
   *
   * A fraction cannot go out of range, so the pixel offset is derived during
   * render and is always valid. Zooming now also keeps the same point of the
   * photo under the middle of the frame, which pixels did not.
   */
  const [focus, setFocus] = useState<Offset>({ x: 0.5, y: 0.5 });
  const [working, setWorking] = useState(false);

  // The frame's rendered size, measured rather than assumed: it is
  // `min(18rem, 100%)` wide, so a phone and a desktop disagree, and every
  // clamp below is in these units.
  const [frame, setFrame] = useState({ width: 0, height: 0 });

  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; from: Offset } | null>(
    null,
  );

  useEffect(() => {
    let disposed = false;
    let created: ImageBitmap | null = null;

    /*
     * `imageOrientation: 'from-image'` is load-bearing, not a nicety. A photo
     * off a phone carries its rotation in EXIF; without this the bitmap is
     * sideways, the instructor crops a sideways picture, and the export is
     * sideways too — while the file preview in every other app shows it
     * upright.
     */
    createImageBitmap(file, { imageOrientation: 'from-image' })
      .then((image) => {
        if (disposed) {
          image.close();
          return;
        }
        created = image;
        setBitmap(image);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      created?.close();
    };
  }, [file]);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    /*
     * The observer alone — no synchronous first measurement.
     *
     * `ResizeObserver` delivers the CURRENT size in its first callback as soon
     * as it observes, so measuring by hand here adds nothing except a
     * `setState` inside an effect body, which triggers a cascading render and
     * is what `react-hooks` flags. It also settles the dialog's open animation
     * for free: a hand-rolled measurement would catch the box mid-scale.
     */
    const observer = new ResizeObserver((entries) => {
      // `noUncheckedIndexedAccess` is on, and it is right to insist: the array
      // is only non-empty because we observe exactly one element.
      const box = entries[0]?.contentRect;
      if (box) setFrame({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [bitmap]);

  /*
   * `'source'` before the decode finishes has nothing to derive a ratio from,
   * so the frame holds 16/9 until the bitmap arrives and then adopts the
   * picture's own. The `ResizeObserver` above is keyed on `bitmap`, so it
   * re-measures the box on exactly that transition.
   */
  const frameAspect = aspect === 'source' ? (bitmap ? bitmap.width / bitmap.height : 16 / 9) : aspect;

  /** The scale at which the image exactly covers the frame. Zoom multiplies it. */
  const baseScale =
    bitmap && frame.width > 0
      ? Math.max(frame.width / bitmap.width, frame.height / bitmap.height)
      : 1;
  const scale = baseScale * zoom;
  const drawnWidth = (bitmap?.width ?? 0) * scale;
  const drawnHeight = (bitmap?.height ?? 0) * scale;

  /*
   * How far the picture can travel on each axis before a gap would open. Zero
   * when the image exactly covers the frame, which is the state at zoom 1 on
   * whichever axis is the tight one.
   */
  const rangeX = Math.max(0, drawnWidth - frame.width);
  const rangeY = Math.max(0, drawnHeight - frame.height);

  // Derived, never stored: `focus` is a fraction, so this cannot land outside
  // the frame no matter what the zoom or the viewport just did.
  const offset: Offset = { x: -rangeX * focus.x, y: -rangeY * focus.y };

  /*
   * Repaint whenever anything about the framing changes.
   *
   * The backing store is sized in DEVICE pixels — a canvas left at its CSS
   * size is drawn at 1× and then stretched by the browser, which on a phone
   * means the instructor judges their crop through a blurred copy of it.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap || frame.width === 0) return;

    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(frame.width * ratio);
    const pixelHeight = Math.round(frame.height * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.drawImage(
      bitmap,
      -offset.x / scale,
      -offset.y / scale,
      frame.width / scale,
      frame.height / scale,
      0,
      0,
      pixelWidth,
      pixelHeight,
    );
  }, [bitmap, frame.width, frame.height, offset.x, offset.y, scale]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!bitmap) return;
    // Capture, so a drag that leaves the frame keeps tracking instead of
    // stopping dead the moment the pointer crosses the edge — which is exactly
    // when someone is pushing the picture to one side.
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      from: focus,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    /*
     * Pixels dragged, converted back into a fraction of the travel available.
     * Moving the pointer by the whole range moves the focus by exactly 1, so
     * the picture tracks the finger at 1:1 regardless of zoom.
     *
     * A zero range means this axis has nothing to pan — the picture already
     * fits it exactly — and dividing by it would produce NaN, which renders as
     * a blank frame rather than as an error anyone could diagnose.
     */
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    setFocus({
      x: rangeX === 0 ? 0.5 : clamp01(drag.from.x - dx / rangeX),
      y: rangeY === 0 ? 0.5 : clamp01(drag.from.y - dy / rangeY),
    });
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
  }

  async function confirm() {
    if (!bitmap || frame.width === 0) return;
    setWorking(true);
    try {
      // The visible window, converted from frame pixels back into the source
      // image's own pixels.
      const sourceX = -offset.x / scale;
      const sourceY = -offset.y / scale;
      const sourceWidth = frame.width / scale;
      const sourceHeight = frame.height / scale;

      const outputWidth = Math.round(Math.min(MAX_OUTPUT_WIDTH, sourceWidth));
      const outputHeight = Math.round(outputWidth / frameAspect);

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d context');
      context.drawImage(
        bitmap,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputWidth,
        outputHeight,
      );

      /*
       * WebP, with JPEG behind it. WebP is on the upload allowlist, keeps
       * alpha, and is what the API re-encodes to anyway — so the round trip
       * costs one generation instead of two. `toBlob` hands back `null` for a
       * type the browser cannot encode, which is the only reliable way to ask.
       */
      const blob =
        (await toBlob(canvas, 'image/webp')) ?? (await toBlob(canvas, 'image/jpeg'));
      if (!blob) throw new Error('encode failed');

      const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
      const stem = file.name.replace(/\.[^.]+$/, '') || 'cover';
      onCropped(new File([blob], `${stem}.${extension}`, { type: blob.type }));
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  }

  if (failed) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {c.cropFailed}
        </p>
        {/* The crop is a convenience; a browser that cannot decode this file
            must not stand between the instructor and their upload. */}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onUseOriginal}>
            {c.cropUseOriginal}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {c.cropCancel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.cropHint}</p>

      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          'relative w-full overflow-hidden rounded-md border border-line bg-surface-2',
          bitmap ? 'cursor-grab active:cursor-grabbing' : '',
          // `touch-none` so a drag pans the picture instead of scrolling the
          // dialog under it — on a phone the two gestures are identical.
          'touch-none select-none',
        )}
        style={{ aspectRatio: String(frameAspect) }}
      >
        {/*
          A CANVAS, not an `<img>` with a transform.

          Three things follow from that. The preview is drawn by the SAME
          `drawImage` call the export uses, so what is on screen is what gets
          uploaded rather than a CSS approximation of it. There is no second
          decode of the file and no `blob:` URL to mint and revoke — the
          `ImageBitmap` is already in memory. And nothing here calls `setState`
          from an effect: painting a canvas is a side effect on an external
          object, which is what effects are actually for.
        */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full"
          aria-hidden="true"
        />
        {bitmap ? null : (
          <span className="absolute inset-0 grid place-items-center text-[length:var(--fs-text-sm)] text-fg-muted">
            {copy.common.loading}
          </span>
        )}
      </div>

      <label className="flex items-center gap-3">
        <span className="shrink-0 text-[length:var(--fs-text-sm)] text-fg-muted">{c.cropZoom}</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="min-w-0 flex-1"
          disabled={!bitmap}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void confirm()} disabled={!bitmap || working}>
          {working ? c.uploading : c.cropConfirm}
        </Button>
        {/* Not everyone wants a crop, and the picture may already be 16:9. */}
        <Button type="button" size="sm" variant="secondary" onClick={onUseOriginal}>
          {c.cropUseOriginal}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {c.cropCancel}
        </Button>
      </div>
    </div>
  );
}

/** `canvas.toBlob` as a promise. Resolves `null` for a type this browser cannot encode. */
function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob && blob.type === type ? blob : null),
      type,
      0.92,
    );
  });
}

/** Keeps a focus fraction inside its own range. */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
