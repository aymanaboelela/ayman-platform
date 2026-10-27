import type { QrMatrix } from './model';

/**
 * The drawing primitives both share images are made of.
 *
 * Canvas, not satori/`next/og`: satori does no Arabic shaping — every letter
 * would come out in its isolated form, «م ح م د» for «محمد» — and the student's
 * NAME is the one string on these images that cannot be wrong. The browser's
 * own text engine shapes Arabic correctly in `fillText`, so the card is drawn
 * where the fonts already are.
 */

export interface CardFonts {
  /** Lalezar — the heavy display face for numbers and headlines. */
  display: string;
  /** IBM Plex Sans Arabic — everything that has to be read, not looked at. */
  body: string;
  /** Aref Ruqaa — the name on the certificate, and the signature. */
  script: string;
}

/**
 * The real family names behind the `next/font` variables.
 *
 * `next/font/local` renames every family (`__Lalezar_3f2a1c`), so a canvas
 * asking for «Lalezar» gets the browser default. The element passed in must
 * carry the three font `variable` classes; its computed custom properties are
 * the exact `font-family` lists the page itself uses.
 */
export function resolveFonts(el: HTMLElement): CardFonts {
  const style = getComputedStyle(el);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    display: read('--font-lalezar', 'sans-serif'),
    body: read('--font-plex-arabic', 'sans-serif'),
    script: read('--font-ruqaa', 'serif'),
  };
}

/**
 * Makes the browser actually download the faces before the first `fillText`.
 *
 * The display faces are `preload: false` and nothing else on a student page
 * uses them, so until something asks for a glyph the `@font-face` rule is only
 * a declaration — and a canvas draw does not count as asking. Without this
 * the first card renders in the fallback and the second one is right.
 */
export async function loadFonts(fonts: CardFonts): Promise<void> {
  const sample = 'أبجد هوز 0123';
  await Promise.all([
    document.fonts.load(`400 64px ${fonts.display}`, sample),
    document.fonts.load(`400 64px ${fonts.body}`, sample),
    document.fonts.load(`700 64px ${fonts.body}`, sample),
    document.fonts.load(`700 64px ${fonts.script}`, sample),
  ]);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Uploads live on the media origin, a different origin by design. Without
    // a CORS request the canvas is tainted and `toBlob` throws AFTER drawing;
    // the media route answers `Access-Control-Allow-Origin: *`.
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${src}`));
    img.src = src;
  });
}

/** Seeded, so the same result redraws with the same embers — no flicker between previews. */
export function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const FIRE = {
  ink: '#07040a',
  coal: '#140a06',
  ember: '#ff4d00',
  flame: '#ff8a00',
  gold: '#ffc94a',
  ash: 'rgba(255,236,220,0.62)',
  white: '#fff6ec',
} as const;

export function fireGradient(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, FIRE.gold);
  g.addColorStop(0.45, FIRE.flame);
  g.addColorStop(1, FIRE.ember);
  return g;
}

/** Floating sparks: a few large blurred ones for depth, many small sharp ones for heat. */
export function drawEmbers(
  ctx: CanvasRenderingContext2D,
  area: { x: number; y: number; w: number; h: number },
  seed: number,
  count: number,
): void {
  const rand = rng(seed);
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const x = area.x + rand() * area.w;
    // Denser toward the bottom of the area, the way sparks rise off a fire.
    const y = area.y + Math.sqrt(rand()) * area.h;
    const big = rand() < 0.12;
    const r = big ? 3 + rand() * 6 : 0.8 + rand() * 2.2;
    ctx.globalAlpha = big ? 0.25 + rand() * 0.25 : 0.45 + rand() * 0.5;
    ctx.shadowColor = FIRE.flame;
    ctx.shadowBlur = big ? 30 : 10;
    ctx.fillStyle = rand() < 0.3 ? FIRE.gold : FIRE.flame;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The largest size ≤ `max` at which `text` fits in `maxWidth`. */
export function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  max: number,
  maxWidth: number,
  min = 18,
): number {
  let size = max;
  ctx.font = font(size);
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = font(size);
  }
  return size;
}

/** Word-wraps into at most `maxLines`, ellipsising the last one. Arabic splits on spaces like Latin. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1] ?? '';
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

/** Centred RTL text — the one alignment both images use. */
export function centerText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

/** The QR on a light rounded tile, so it scans off a dark story at any brightness. */
export function drawQr(ctx: CanvasRenderingContext2D, qr: QrMatrix, x: number, y: number, size: number): void {
  const pad = size * 0.08;
  ctx.save();
  ctx.fillStyle = FIRE.white;
  roundRect(ctx, x, y, size, size, size * 0.1);
  ctx.fill();
  const cell = (size - pad * 2) / qr.size;
  ctx.fillStyle = FIRE.ink;
  for (let row = 0; row < qr.size; row += 1) {
    for (let col = 0; col < qr.size; col += 1) {
      if (!qr.bits[row * qr.size + col]) continue;
      // +0.5px overlap so adjacent modules never show a hairline seam when scaled.
      ctx.fillRect(x + pad + col * cell, y + pad + row * cell, cell + 0.5, cell + 0.5);
    }
  }
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * A signature image, `contain`-fitted into `maxW × maxH` and sitting ON the
 * line at `baseY` — the way ink sits on a signature line, not centred in a
 * box above it.
 */
export function drawSignature(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  baseY: number,
  maxW: number,
  maxH: number,
): void {
  const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, cx - w / 2, baseY - h, w, h);
}

/** `object-fit: cover` for `drawImage`, with a focal point. */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: { x: number; y: number; w: number; h: number },
  focus: { x: number; y: number } = { x: 0.5, y: 0.5 },
): void {
  const scale = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight);
  const sw = box.w / scale;
  const sh = box.h / scale;
  const sx = Math.min(Math.max(img.naturalWidth * focus.x - sw / 2, 0), img.naturalWidth - sw);
  const sy = Math.min(Math.max(img.naturalHeight * focus.y - sh / 2, 0), img.naturalHeight - sh);
  ctx.drawImage(img, sx, sy, sw, sh, box.x, box.y, box.w, box.h);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))), type, quality);
  });
}
