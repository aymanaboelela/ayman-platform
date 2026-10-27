import {
  FIRE,
  centerText,
  drawEmbers,
  drawQr,
  fireGradient,
  fitFontSize,
  roundRect,
  seedOf,
  type CardFonts,
} from '@/lib/share-card/canvas-kit';
import type { QrMatrix } from '@/lib/share-card/model';

export const RECAP_STORY = { w: 1080, h: 1920 } as const;

export interface RecapStoryInput {
  studentName: string;
  /** Every string resolved by the caller — the teacher's name through the tenant gate. */
  text: {
    platform: string;
    heading: string;
    watchValue: string;
    watchLabel: string;
    tiles: readonly { value: string; label: string }[];
    dailyLine: string | null;
    studyWith: string;
    siteHost: string;
    qrHint: string;
  };
  qr: QrMatrix;
  fonts: CardFonts;
}

/**
 * «ملخص الشهر» as a story: the month, the name, the hours in fire, four
 * tiles, and the same footer the result card carries (who, where, a QR in).
 *
 * The same 1080×1920 grid and palette as `draw-result.ts`, so a student's two
 * stories read as one series.
 */
export function drawRecapStory(canvas: HTMLCanvasElement, input: RecapStoryInput): void {
  const { w, h } = RECAP_STORY;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const { fonts, text } = input;
  const cx = w / 2;
  const seed = seedOf(`${input.studentName}|${text.heading}`);

  // ── Ground ──────────────────────────────────────────────────────────────
  const ground = ctx.createLinearGradient(0, 0, 0, h);
  ground.addColorStop(0, FIRE.coal);
  ground.addColorStop(0.55, FIRE.ink);
  ground.addColorStop(1, '#1a0b04');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(cx, 560, 40, cx, 560, 700);
  glow.addColorStop(0, 'rgba(255,120,0,0.32)');
  glow.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  drawEmbers(ctx, { x: 0, y: 0, w, h: h * 0.75 }, seed, 140);

  // ── Kicker, month, name ─────────────────────────────────────────────────
  ctx.fillStyle = FIRE.ash;
  ctx.font = `600 40px ${fonts.body}`;
  centerText(ctx, text.platform, cx, 150);

  ctx.fillStyle = fireGradient(ctx, cx - 380, 200, cx + 380, 300);
  const headingSize = fitFontSize(ctx, text.heading, (s) => `400 ${s}px ${fonts.display}`, 112, w - 140, 60);
  ctx.font = `400 ${headingSize}px ${fonts.display}`;
  ctx.shadowColor = 'rgba(255,90,0,0.7)';
  ctx.shadowBlur = 40;
  centerText(ctx, text.heading, cx, 290);
  ctx.shadowBlur = 0;

  ctx.fillStyle = FIRE.white;
  const nameSize = fitFontSize(ctx, input.studentName, (s) => `700 ${s}px ${fonts.body}`, 64, w - 160, 36);
  ctx.font = `700 ${nameSize}px ${fonts.body}`;
  centerText(ctx, input.studentName, cx, 390);

  // ── The hours ───────────────────────────────────────────────────────────
  ctx.fillStyle = fireGradient(ctx, cx - 300, 470, cx + 300, 700);
  ctx.shadowColor = 'rgba(255,120,0,0.9)';
  ctx.shadowBlur = 60;
  const watchSize = fitFontSize(ctx, text.watchValue, (s) => `400 ${s}px ${fonts.display}`, 220, w - 160, 90);
  ctx.font = `400 ${watchSize}px ${fonts.display}`;
  centerText(ctx, text.watchValue, cx, 690);
  ctx.shadowBlur = 0;
  ctx.fillStyle = FIRE.ash;
  ctx.font = `600 46px ${fonts.body}`;
  centerText(ctx, text.watchLabel, cx, 770);

  // ── Four tiles, two by two ──────────────────────────────────────────────
  const tileW = (w - 60 * 2 - 36) / 2;
  const tileH = 250;
  text.tiles.slice(0, 4).forEach((tile, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    // RTL: the first tile sits on the visual right.
    const x = col === 0 ? w - 60 - tileW : 60;
    const y = 850 + row * (tileH + 36);
    ctx.save();
    ctx.fillStyle = 'rgba(255,236,220,0.07)';
    ctx.strokeStyle = 'rgba(255,138,0,0.35)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, tileW, tileH, 36);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = FIRE.gold;
    const valueSize = fitFontSize(ctx, tile.value, (s) => `400 ${s}px ${fonts.display}`, 120, tileW - 60, 56);
    ctx.font = `400 ${valueSize}px ${fonts.display}`;
    centerText(ctx, tile.value, x + tileW / 2, y + 150);
    ctx.fillStyle = FIRE.ash;
    ctx.font = `600 36px ${fonts.body}`;
    centerText(ctx, tile.label, x + tileW / 2, y + 210);
  });

  if (text.dailyLine) {
    ctx.fillStyle = FIRE.white;
    ctx.font = `600 42px ${fonts.body}`;
    centerText(ctx, text.dailyLine, cx, 1490);
  }

  // ── Footer: who, where, and a way in (as on the result card) ────────────
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
