import { captionCopy } from '@ayman/contracts/copy/social-posts';
import { num } from '@ayman/contracts/social/caption';
import { SOCIAL_IMAGE_SIZE, type SocialFacts, type SocialPerson, type SocialPostFormat } from '@ayman/contracts/social/posts';
import { drawCover, fitFontSize, rng, roundRect, seedOf, wrapLines, type CardFonts } from '@/lib/share-card/canvas-kit';
import type { SocialPalette } from './palette';

/**
 * «استوديو البوستات» pictures — 1080×1080 for the feed, 1080×1920 for a story.
 *
 * Drawn on the same canvas kit as the students' share cards, for the reason
 * that file gives: the browser's own text engine is the only one here that
 * shapes Arabic, and a student's name is the one string that cannot be
 * wrong. Everything that says WHOSE platform this is arrives resolved —
 * `brand.platform` through `tenantName`, the colours from the tenant's own
 * tokens (`palette.ts`) — so nothing here can draw another teacher's name.
 *
 * Every position is a constant on the 1080-wide grid; the story only gets a
 * taller content area, never a different design.
 */

const c = captionCopy.image;

export interface PostBrand {
  platform: string;
  /** `example.com` — printed in the footer, no scheme. */
  siteHost: string;
}

export interface PostImages {
  cover?: HTMLImageElement;
  /** Honor-board photos by storage key. A missing one draws initials. */
  photos: ReadonlyMap<string, HTMLImageElement>;
}

export interface PostDrawInput {
  facts: SocialFacts;
  format: SocialPostFormat;
  /** The kind's label for the chip at the top («لوحة الشرف»…). */
  kindLabel: string;
  brand: PostBrand;
  palette: SocialPalette;
  fonts: CardFonts;
  images: PostImages;
}

const W = 1080;
const PAD = 72;
const WHITE = '#ffffff';
/** Second and third place. Gold comes from the palette (`--print-gold`). */
const SILVER = '#d7dce4';
const BRONZE = '#d99a62';

interface Area {
  top: number;
  bottom: number;
}

/** The storage keys of every photo a post would draw — so the dialog loads them before drawing. */
export function photoKeysOf(facts: SocialFacts): string[] {
  const people = facts.kind === 'honor' ? facts.people : facts.kind === 'results' ? facts.top : [];
  return [...new Set(people.map((person) => person.photoKey).filter((key): key is string => Boolean(key)))];
}

export function coverKeyOf(facts: SocialFacts): string | null {
  return facts.kind === 'course' || facts.kind === 'lecture' || facts.kind === 'news' ? facts.coverKey : null;
}

export function drawSocialPost(canvas: HTMLCanvasElement, input: PostDrawInput): void {
  const { w, h } = SOCIAL_IMAGE_SIZE[input.format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.direction = 'rtl';

  const story = input.format === 'story';
  drawGround(ctx, h, input);
  const chipBottom = drawChip(ctx, story ? 200 : 64, input);
  const footerTop = drawFooter(ctx, h, input);
  const area: Area = { top: chipBottom + (story ? 110 : 40), bottom: footerTop - (story ? 120 : 32) };

  // Measure first, on a scratch canvas, then draw for real with the content
  // centred in the space it leaves — a news post or a short digest would
  // otherwise sit at the top of a story with half the picture empty.
  const probe = document.createElement('canvas');
  probe.width = w;
  probe.height = h;
  const probeCtx = probe.getContext('2d');
  const bottom = probeCtx ? drawKind(probeCtx, area, input) : area.bottom;
  ctx.save();
  ctx.translate(0, Math.max(0, (area.bottom - bottom) / 2));
  drawKind(ctx, area, input);
  ctx.restore();
}

/** Draws the kind's block inside `area` and returns where it ended. */
function drawKind(ctx: CanvasRenderingContext2D, area: Area, input: PostDrawInput): number {
  ctx.direction = 'rtl';
  switch (input.facts.kind) {
    case 'honor':
      return drawHonor(ctx, input.facts, area, input);
    case 'results':
      return drawResults(ctx, input.facts, area, input);
    case 'certificates':
      return drawCertificates(ctx, input.facts, area, input);
    case 'course':
      return drawContent(ctx, { title: input.facts.title, sub: input.facts.subtitle, badge: c.newCourse }, area, input);
    case 'lecture':
      return drawContent(
        ctx,
        { title: input.facts.title, sub: `${input.facts.courseTitle} — ${input.facts.sectionTitle}`, badge: c.newLecture },
        area,
        input,
      );
    case 'news':
      return drawContent(ctx, { title: input.facts.title, sub: input.facts.excerpt, badge: c.news }, area, input);
  }
}

// ── Frame ──────────────────────────────────────────────────────────────────

function drawGround(ctx: CanvasRenderingContext2D, h: number, input: PostDrawInput): void {
  const { palette } = input;
  const ground = ctx.createLinearGradient(0, 0, W * 0.4, h);
  ground.addColorStop(0, palette.mid);
  ground.addColorStop(1, palette.deep);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, W, h);

  // A warm glow in the top corner and a cool one opposite — the colour the
  // admin asked for, without a busy pattern behind the text.
  const glow = ctx.createRadialGradient(W * 0.9, h * 0.06, 20, W * 0.9, h * 0.06, W * 0.75);
  glow.addColorStop(0, withAlpha(palette.accent, 0.55));
  glow.addColorStop(1, withAlpha(palette.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, h);

  const rand = rng(seedOf(JSON.stringify(input.facts)));
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  for (let i = 0; i < 3; i += 1) {
    ctx.lineWidth = 18 + rand() * 26;
    ctx.beginPath();
    ctx.arc(rand() < 0.5 ? -40 + rand() * 200 : W - rand() * 200, rand() * h, 120 + rand() * 180, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 26; i += 1) {
    ctx.beginPath();
    ctx.arc(rand() * W, rand() * h, 2 + rand() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The kind's pill at the top. Returns its bottom edge. */
function drawChip(ctx: CanvasRenderingContext2D, top: number, input: PostDrawInput): number {
  const height = 78;
  ctx.font = `400 46px ${input.fonts.display}`;
  const width = Math.min(W - PAD * 2, ctx.measureText(input.kindLabel).width + 96);
  const x = (W - width) / 2;
  ctx.fillStyle = input.palette.accent;
  roundRect(ctx, x, top, width, height, height / 2);
  ctx.fill();
  ctx.fillStyle = input.palette.deep;
  center(ctx, input.kindLabel, W / 2, top + 54);
  return top + height;
}

/** Platform name and site at the bottom — what turns a screenshot into a visit. Returns its top. */
function drawFooter(ctx: CanvasRenderingContext2D, h: number, input: PostDrawInput): number {
  const bottom = h - 64;
  ctx.fillStyle = withAlpha(input.palette.accent, 0.9);
  ctx.fillRect(W / 2 - 60, bottom - 118, 120, 6);
  ctx.fillStyle = WHITE;
  const size = fitFontSize(ctx, input.brand.platform, (s) => `400 ${s}px ${input.fonts.display}`, 52, W - PAD * 2, 30);
  ctx.font = `400 ${size}px ${input.fonts.display}`;
  center(ctx, input.brand.platform, W / 2, bottom - 46);
  ctx.font = `600 32px ${input.fonts.body}`;
  ctx.fillStyle = input.palette.soft;
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.fillText(input.brand.siteHost, W / 2, bottom);
  ctx.restore();
  return bottom - 130;
}

// ── Kinds ──────────────────────────────────────────────────────────────────

function drawTitle(ctx: CanvasRenderingContext2D, text: string, y: number, input: PostDrawInput, max = 76, lines = 2): number {
  ctx.fillStyle = WHITE;
  const size = fitFontSize(ctx, text, (s) => `400 ${s}px ${input.fonts.display}`, max, (W - PAD * 2) * lines * 0.92, 40);
  ctx.font = `400 ${size}px ${input.fonts.display}`;
  const wrapped = wrapLines(ctx, text, W - PAD * 2, lines);
  const lineHeight = size * 1.25;
  wrapped.forEach((line, i) => center(ctx, line, W / 2, y + size + i * lineHeight));
  return y + size + (wrapped.length - 1) * lineHeight + size * 0.35;
}

function drawHonor(ctx: CanvasRenderingContext2D, facts: Extract<SocialFacts, { kind: 'honor' }>, area: Area, input: PostDrawInput): number {
  let y = drawTitle(ctx, facts.title, area.top, input, 64);
  ctx.font = `700 34px ${input.fonts.body}`;
  ctx.fillStyle = input.palette.gold;
  center(ctx, c.congrats, W / 2, y + 40);
  y += 80;

  const rows = facts.people.length;
  const gap = 18;
  const rowH = Math.min(150, (area.bottom - y - gap * (rows - 1)) / rows);
  facts.people.forEach((person, i) => drawPersonRow(ctx, person, i, y + i * (rowH + gap), rowH, input));
  return y + rows * rowH + (rows - 1) * gap;
}

function drawResults(ctx: CanvasRenderingContext2D, facts: Extract<SocialFacts, { kind: 'results' }>, area: Area, input: PostDrawInput): number {
  let y = drawTitle(ctx, facts.examTitle, area.top, input, 64);
  ctx.font = `500 30px ${input.fonts.body}`;
  ctx.fillStyle = input.palette.soft;
  const course = wrapLines(ctx, facts.courseTitle, W - PAD * 2, 1)[0] ?? '';
  center(ctx, course, W / 2, y + 30);
  y += 64;

  const story = input.format === 'story';
  const tileH = story ? 230 : 150;
  const tiles: Array<[string, string]> = [
    [num(facts.takers), c.takers],
    [`${num(facts.averagePercent)}٪`, c.average],
    [`${num(facts.passRate)}٪`, c.passRate],
  ];
  const gap = 24;
  const tileW = (W - PAD * 2 - gap * 2) / 3;
  tiles.forEach(([value, label], i) => {
    // RTL: the first tile sits at the inline start, on the right.
    const x = W - PAD - tileW - i * (tileW + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(ctx, x, y, tileW, tileH, 32);
    ctx.fill();
    ctx.fillStyle = i === 0 ? WHITE : input.palette.gold;
    const size = fitFontSize(ctx, value, (s) => `400 ${s}px ${input.fonts.display}`, story ? 92 : 80, tileW - 32, 36);
    ctx.font = `400 ${size}px ${input.fonts.display}`;
    center(ctx, value, x + tileW / 2, y + tileH * 0.56);
    ctx.font = `600 30px ${input.fonts.body}`;
    ctx.fillStyle = input.palette.soft;
    center(ctx, label, x + tileW / 2, y + tileH - 30);
  });
  y += tileH + (story ? 28 : 20);

  if (facts.fullMarks > 0) {
    ctx.font = `700 ${story ? 34 : 30}px ${input.fonts.body}`;
    ctx.fillStyle = input.palette.gold;
    center(ctx, `⭐ ${num(facts.fullMarks)} ${c.fullMarks}`, W / 2, y + 30);
    y += story ? 66 : 52;
  }

  const rows = facts.top.length;
  if (rows === 0) return y;
  const rowGap = story ? 16 : 12;
  const rowH = Math.min(story ? 150 : 100, (area.bottom - y - rowGap * (rows - 1)) / rows);
  // Too little room for a legible name: the numbers above stand alone.
  if (rowH < 60) return y;
  facts.top.forEach((person, i) => drawPersonRow(ctx, person, i, y + i * (rowH + rowGap), rowH, input));
  return y + rows * rowH + (rows - 1) * rowGap;
}

function drawCertificates(
  ctx: CanvasRenderingContext2D,
  facts: Extract<SocialFacts, { kind: 'certificates' }>,
  area: Area,
  input: PostDrawInput,
): number {
  const story = input.format === 'story';
  let y = area.top;
  ctx.fillStyle = input.palette.gold;
  ctx.font = `400 ${story ? 230 : 190}px ${input.fonts.display}`;
  center(ctx, num(facts.total), W / 2, y + (story ? 210 : 172));
  y += story ? 250 : 206;
  ctx.fillStyle = WHITE;
  ctx.font = `400 56px ${input.fonts.display}`;
  center(ctx, c.certificatesUnit, W / 2, y + 40);
  y += 84;

  const max = Math.max(...facts.units.map((unit) => unit.count), 1);
  const rowH = story ? 104 : 78;
  for (const unit of facts.units) {
    if (y + rowH > area.bottom - 60) break;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(ctx, PAD, y, W - PAD * 2, rowH - 14, 22);
    ctx.fill();
    const fill = ((W - PAD * 2) * unit.count) / max;
    ctx.fillStyle = withAlpha(input.palette.accent, 0.55);
    roundRect(ctx, W - PAD - fill, y, fill, rowH - 14, 22);
    ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.font = `700 32px ${input.fonts.body}`;
    ctx.textAlign = 'right';
    const title = wrapLines(ctx, unit.title, W - PAD * 2 - 180, 1)[0] ?? '';
    ctx.fillText(title, W - PAD - 28, y + (rowH - 14) / 2 + 12);
    ctx.textAlign = 'left';
    ctx.font = `400 42px ${input.fonts.display}`;
    ctx.fillText(num(unit.count), PAD + 28, y + (rowH - 14) / 2 + 15);
    y += rowH;
  }

  if (facts.people.length > 0 && y < area.bottom - 60) {
    ctx.fillStyle = input.palette.soft;
    ctx.font = `600 32px ${input.fonts.body}`;
    const lines = wrapLines(ctx, `${c.congrats}: ${facts.people.map((p) => p.name).join('، ')}`, W - PAD * 2, story ? 3 : 2);
    lines.forEach((line, i) => center(ctx, line, W / 2, y + 44 + i * 46));
    y += 20 + lines.length * 46;
  }
  return y;
}

function drawContent(
  ctx: CanvasRenderingContext2D,
  content: { title: string; sub: string | null; badge: string },
  area: Area,
  input: PostDrawInput,
): number {
  const story = input.format === 'story';
  let y = area.top;
  const coverW = W - PAD * 2;
  const coverH = Math.round(coverW * (9 / 16));

  if (input.images.cover) {
    ctx.save();
    roundRect(ctx, PAD, y, coverW, coverH, 36);
    ctx.clip();
    drawCover(ctx, input.images.cover, { x: PAD, y, w: coverW, h: coverH });
    ctx.restore();
    ctx.strokeStyle = withAlpha(input.palette.accent, 0.9);
    ctx.lineWidth = 6;
    roundRect(ctx, PAD, y, coverW, coverH, 36);
    ctx.stroke();
    y += coverH + (story ? 80 : 44);
  } else {
    // No cover: a big medallion so the post is never just text on a gradient.
    const r = story ? 190 : 120;
    const cy = y + r + 10;
    ctx.fillStyle = withAlpha(input.palette.accent, 0.22);
    ctx.beginPath();
    ctx.arc(W / 2, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = input.palette.accent;
    ctx.beginPath();
    ctx.arc(W / 2, cy, r * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = input.palette.deep;
    const size = fitFontSize(ctx, content.badge, (s) => `400 ${s}px ${input.fonts.display}`, story ? 70 : 52, r * 1.3, 24);
    ctx.font = `400 ${size}px ${input.fonts.display}`;
    center(ctx, content.badge, W / 2, cy + size * 0.35);
    y = cy + r + (story ? 90 : 50);
  }

  y = drawTitle(ctx, content.title, y, input, story ? 86 : 70, story ? 3 : 2);
  if (content.sub) {
    ctx.fillStyle = input.palette.soft;
    ctx.font = `500 ${story ? 38 : 32}px ${input.fonts.body}`;
    const room = Math.max(1, Math.floor((area.bottom - y - 20) / (story ? 54 : 46)));
    const lines = wrapLines(ctx, content.sub, W - PAD * 2, Math.min(story ? 5 : 2, room));
    lines.forEach((line, i) => center(ctx, line, W / 2, y + 40 + i * (story ? 54 : 46)));
    y += 20 + lines.length * (story ? 54 : 46);
  }
  return y;
}

// ── People ─────────────────────────────────────────────────────────────────

function drawPersonRow(
  ctx: CanvasRenderingContext2D,
  person: SocialPerson,
  index: number,
  y: number,
  rowH: number,
  input: PostDrawInput,
): void {
  const { palette, fonts } = input;
  const place = person.rank ?? index + 1;
  const medal = place === 1 ? palette.gold : place === 2 ? SILVER : place === 3 ? BRONZE : withAlpha('#ffffff', 0.4);

  ctx.fillStyle = place === 1 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.09)';
  roundRect(ctx, PAD, y, W - PAD * 2, rowH, Math.min(36, rowH / 2));
  ctx.fill();
  if (place === 1) {
    ctx.strokeStyle = palette.gold;
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  const cy = y + rowH / 2;
  // RTL: place, then the face, then the name, from the right edge inward.
  const medalR = Math.min(34, rowH * 0.28);
  const medalX = W - PAD - 28 - medalR;
  ctx.fillStyle = medal;
  ctx.beginPath();
  ctx.arc(medalX, cy, medalR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.deep;
  ctx.font = `400 ${Math.round(medalR * 1.2)}px ${fonts.display}`;
  center(ctx, num(place), medalX, cy + medalR * 0.42);

  const faceR = Math.min(52, rowH * 0.38);
  const faceX = medalX - medalR - 24 - faceR;
  drawFace(ctx, person, faceX, cy, faceR, input);

  const nameRight = faceX - faceR - 24;
  const markWidth = person.score !== null && person.total !== null ? 210 : 0;
  ctx.fillStyle = WHITE;
  const size = fitFontSize(ctx, person.name, (s) => `700 ${s}px ${fonts.body}`, Math.min(46, rowH * 0.36), nameRight - PAD - 28 - markWidth, 24);
  ctx.font = `700 ${size}px ${fonts.body}`;
  ctx.textAlign = 'right';
  ctx.fillText(person.name, nameRight, cy + size * 0.36);

  if (markWidth > 0) {
    const mark = captionCopy.scoreOf(num(person.score!), num(person.total!));
    ctx.fillStyle = palette.gold;
    const markSize = fitFontSize(ctx, mark, (s) => `400 ${s}px ${fonts.display}`, Math.min(44, rowH * 0.34), markWidth, 22);
    ctx.font = `400 ${markSize}px ${fonts.display}`;
    ctx.textAlign = 'left';
    ctx.fillText(mark, PAD + 28, cy + markSize * 0.36);
  }
}

/** The honor-board photo when the instructor set one, initials on a tinted disc otherwise. */
function drawFace(ctx: CanvasRenderingContext2D, person: SocialPerson, x: number, y: number, r: number, input: PostDrawInput): void {
  const photo = person.photoKey ? input.images.photos.get(person.photoKey) : undefined;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  if (photo) {
    ctx.clip();
    drawCover(ctx, photo, { x: x - r, y: y - r, w: r * 2, h: r * 2 }, { x: 0.5, y: 0.35 });
  } else {
    ctx.fillStyle = withAlpha(input.palette.accent, 0.35);
    ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.font = `400 ${Math.round(r * 0.9)}px ${input.fonts.display}`;
    center(ctx, initials(person.name), x, y + r * 0.32);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function initials(name: string): string {
  const parts = name.replace(/\./g, '').split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join(' ');
}

// ── Primitives ─────────────────────────────────────────────────────────────

function center(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

/**
 * A colour at an alpha. `color-mix` would be the CSS answer, but `fillStyle`
 * does not take it everywhere yet; `rgb()`/`oklch()` strings from the
 * palette accept a slash alpha, which every canvas that draws oklch reads.
 */
function withAlpha(color: string, alpha: number): string {
  const fn = /^(rgba?|oklch|oklab|lab|lch|hsla?)\((.*)\)$/.exec(color.trim());
  if (fn) {
    const name = fn[1]!.replace(/a$/, '');
    let channels = fn[2]!.split('/')[0]!.replace(/,/g, ' ').trim().split(/\s+/);
    // `rgba(1, 2, 3, 0.5)` carries its alpha as a fourth channel, not after a slash.
    if ((name === 'rgb' || name === 'hsl') && channels.length > 3) channels = channels.slice(0, 3);
    return `${name}(${channels.join(' ')} / ${alpha})`;
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return `${color}${Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')}`;
  }
  return color;
}

export const __test = { withAlpha, initials };
