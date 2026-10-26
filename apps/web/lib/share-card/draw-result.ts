import {
  FIRE,
  centerText,
  drawCover,
  drawEmbers,
  drawQr,
  fireGradient,
  fitFontSize,
  roundRect,
  seedOf,
  wrapLines,
  type CardFonts,
} from './canvas-kit';
import type { QrMatrix } from './model';

/** Instagram/TikTok story size. Anything else gets letterboxed or cropped by the app. */
export const STORY = { w: 1080, h: 1920 } as const;

export interface ResultCardInput {
  studentName: string;
  examTitle: string;
  score: number;
  total: number;
  /** All copy arrives resolved — the teacher's name already through the tenant gate. */
  text: {
    platform: string;
    kicker: string;
    scoreOf: string;
    tier: string;
    tierLine: string;
    studyWith: string;
    siteHost: string;
    qrHint: string;
  };
  qr: QrMatrix;
  /** His stack only. Absent, the top of the card is drawn fire instead. */
  hero?: HTMLImageElement;
  fonts: CardFonts;
}

const num = (n: number) => n.toLocaleString('ar-EG', { maximumFractionDigits: 1 });

/**
 * The story card: the dragon (or a wall of fire) at the top, the name and the
 * exam, a burning score ring, the tier, and a footer that sends whoever sees
 * the story to the platform.
 *
 * Every vertical position is a constant on a 1080×1920 grid. The canvas is
 * drawn at that size and only ever scaled as a whole, so nothing here has to
 * know about the screen it ends up on.
 */
export function drawResultCard(canvas: HTMLCanvasElement, input: ResultCardInput): void {
  const { w, h } = STORY;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const { fonts, text } = input;
  const cx = w / 2;
  const seed = seedOf(`${input.studentName}|${input.examTitle}|${input.score}`);

  // ── Ground ──────────────────────────────────────────────────────────────
  ctx.fillStyle = FIRE.ink;
  ctx.fillRect(0, 0, w, h);

  const heroH = 960;
  if (input.hero) {
    // Focus between his face and the dragon's head — the two things the
    // composite is about. The source is landscape; the card keeps its middle.
    drawCover(ctx, input.hero, { x: 0, y: 0, w, h: heroH }, { x: 0.36, y: 0.4 });
  } else {
    const glow = ctx.createRadialGradient(cx, 980, 40, cx, 760, 900);
    glow.addColorStop(0, 'rgba(255,110,0,0.75)');
    glow.addColorStop(0.35, 'rgba(255,60,0,0.28)');
    glow.addColorStop(1, 'rgba(7,4,10,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, heroH);
    drawFlames(ctx, w, heroH, seed);
  }

  // The hero dissolves into the ink well above the name, so the type sits on
  // flat black and stays legible whatever the picture does.
  const fade = ctx.createLinearGradient(0, heroH * 0.42, 0, heroH);
  fade.addColorStop(0, 'rgba(7,4,10,0)');
  fade.addColorStop(0.7, 'rgba(7,4,10,0.86)');
  fade.addColorStop(1, FIRE.ink);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, heroH);
  // And a lid, so the platform line at the very top reads over a bright sky.
  const lid = ctx.createLinearGradient(0, 0, 0, 260);
  lid.addColorStop(0, 'rgba(7,4,10,0.85)');
  lid.addColorStop(1, 'rgba(7,4,10,0)');
  ctx.fillStyle = lid;
  ctx.fillRect(0, 0, w, 260);

  drawEmbers(ctx, { x: 0, y: 0, w, h }, seed, 140);

  // Heat haze at the bottom edge — the card «burns» from both ends.
  const floor = ctx.createRadialGradient(cx, h + 120, 40, cx, h + 120, 760);
  floor.addColorStop(0, 'rgba(255,90,0,0.38)');
  floor.addColorStop(1, 'rgba(255,90,0,0)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, h - 700, w, 700);

  // ── Platform line ───────────────────────────────────────────────────────
  ctx.fillStyle = FIRE.gold;
  ctx.font = `400 46px ${fonts.display}`;
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 18;
  centerText(ctx, text.platform, cx, 118);
  ctx.shadowBlur = 0;
  ctx.fillStyle = fireGradient(ctx, cx - 120, 0, cx + 120, 0);
  ctx.fillRect(cx - 120, 146, 240, 4);

  // ── Name ────────────────────────────────────────────────────────────────
  ctx.fillStyle = FIRE.white;
  const nameSize = fitFontSize(ctx, input.studentName, (s) => `400 ${s}px ${fonts.display}`, 104, w - 140, 54);
  ctx.font = `400 ${nameSize}px ${fonts.display}`;
  ctx.shadowColor = 'rgba(255,90,0,0.55)';
  ctx.shadowBlur = 36;
  centerText(ctx, input.studentName, cx, 790);
  ctx.shadowBlur = 0;

  // ── Exam ────────────────────────────────────────────────────────────────
  ctx.fillStyle = FIRE.ash;
  ctx.font = `500 38px ${fonts.body}`;
  centerText(ctx, text.kicker, cx, 858);
  ctx.fillStyle = FIRE.white;
  ctx.font = `700 50px ${fonts.body}`;
  const examLines = wrapLines(ctx, input.examTitle, w - 180, 2);
  examLines.forEach((line, i) => centerText(ctx, line, cx, 922 + i * 60));

  // ── Score ring ──────────────────────────────────────────────────────────
  // Fixed, not flowed from the exam title: the footer is anchored to the
  // bottom edge, so everything between has a budget, and a two-line title is
  // already inside it.
  const ringY = 1262;
  const r = 186;
  const ratio = Math.max(0, Math.min(1, input.score / input.total));
  ctx.lineCap = 'round';
  ctx.lineWidth = 30;
  ctx.strokeStyle = 'rgba(255,236,220,0.08)';
  ctx.beginPath();
  ctx.arc(cx, ringY, r, 0, Math.PI * 2);
  ctx.stroke();
  // Tick marks around the track: reads as a gauge, not a donut chart.
  ctx.save();
  ctx.strokeStyle = 'rgba(255,201,74,0.28)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 60; i += 1) {
    const a = (i / 60) * Math.PI * 2;
    const r0 = r + 34;
    const r1 = r + (i % 5 === 0 ? 52 : 42);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, ringY + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, ringY + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();
  // The arc fills clockwise from twelve o'clock, burning.
  const start = -Math.PI / 2;
  ctx.save();
  ctx.strokeStyle = fireGradient(ctx, cx - r, ringY + r, cx + r, ringY - r);
  ctx.shadowColor = FIRE.flame;
  ctx.shadowBlur = 48;
  ctx.beginPath();
  ctx.arc(cx, ringY, r, start, start + Math.PI * 2 * ratio);
  ctx.stroke();
  ctx.restore();
  // Inner disc so the number sits on something.
  const disc = ctx.createRadialGradient(cx, ringY - 40, 10, cx, ringY, r - 24);
  disc.addColorStop(0, 'rgba(255,110,0,0.22)');
  disc.addColorStop(1, 'rgba(20,10,6,0.9)');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, ringY, r - 24, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = fireGradient(ctx, cx, ringY - 120, cx, ringY + 40);
  ctx.shadowColor = 'rgba(255,120,0,0.9)';
  ctx.shadowBlur = 40;
  const scoreText = num(input.score);
  const scoreSize = fitFontSize(ctx, scoreText, (s) => `400 ${s}px ${fonts.display}`, 176, r * 1.5, 80);
  ctx.font = `400 ${scoreSize}px ${fonts.display}`;
  centerText(ctx, scoreText, cx, ringY + 36);
  ctx.shadowBlur = 0;
  ctx.fillStyle = FIRE.ash;
  ctx.font = `600 44px ${fonts.body}`;
  centerText(ctx, text.scoreOf, cx, ringY + 100);

  // ── Tier ────────────────────────────────────────────────────────────────
  const tierY = 1592;
  ctx.font = `400 92px ${fonts.display}`;
  ctx.fillStyle = fireGradient(ctx, cx - 300, tierY - 80, cx + 300, tierY);
  ctx.shadowColor = 'rgba(255,90,0,0.7)';
  ctx.shadowBlur = 50;
  centerText(ctx, text.tier, cx, tierY);
  ctx.shadowBlur = 0;
  ctx.fillStyle = FIRE.ash;
  ctx.font = `500 38px ${fonts.body}`;
  centerText(ctx, text.tierLine, cx, tierY + 56);

  // ── Footer: who, where, and a way in ────────────────────────────────────
  const footY = h - 226;
  ctx.save();
  ctx.fillStyle = 'rgba(255,236,220,0.06)';
  ctx.strokeStyle = 'rgba(255,138,0,0.35)';
  ctx.lineWidth = 2;
  roundRect(ctx, 60, footY, w - 120, 180, 36);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  const qrSize = 140;
  // QR on the visual LEFT, text on the right — the reading start in RTL.
  drawQr(ctx, input.qr, 80, footY + 20, qrSize);
  const textX = (80 + qrSize + w - 60) / 2 + 10;
  ctx.fillStyle = FIRE.white;
  ctx.font = `700 40px ${fonts.body}`;
  centerText(ctx, text.studyWith, textX, footY + 74);
  ctx.fillStyle = FIRE.gold;
  ctx.font = `600 40px ${fonts.body}`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.fillText(text.siteHost, textX, footY + 124);
  ctx.fillStyle = 'rgba(255,236,220,0.5)';
  ctx.font = `500 26px ${fonts.body}`;
  centerText(ctx, text.qrHint, textX, footY + 162);
}

/** Procedural flame tongues for a stack with no hero art — layered, seeded, additive. */
function drawFlames(ctx: CanvasRenderingContext2D, w: number, base: number, seed: number): void {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let layer = 0; layer < 3; layer += 1) {
    const color = ['rgba(255,60,0,0.16)', 'rgba(255,130,0,0.14)', 'rgba(255,200,80,0.12)'][layer] ?? '';
    ctx.fillStyle = color;
    for (let i = 0; i < 9; i += 1) {
      const x = (i / 8) * w + (rand() - 0.5) * 120;
      const height = base * (0.35 + rand() * 0.45) * (1 - layer * 0.18);
      const width = 160 + rand() * 180;
      ctx.beginPath();
      ctx.moveTo(x - width / 2, base);
      ctx.bezierCurveTo(x - width / 2, base - height * 0.5, x - width * 0.1, base - height * 0.7, x + (rand() - 0.5) * 60, base - height);
      ctx.bezierCurveTo(x + width * 0.1, base - height * 0.7, x + width / 2, base - height * 0.5, x + width / 2, base);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}
