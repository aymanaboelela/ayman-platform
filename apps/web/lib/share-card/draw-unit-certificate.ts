import {
  FIRE,
  centerText,
  drawCover,
  drawEmbers,
  drawQr,
  drawSignature,
  fireGradient,
  fitFontSize,
  seedOf,
  wrapLines,
  type CardFonts,
} from './canvas-kit';
import type { QrMatrix } from './model';

/** A4 landscape at ~212 dpi — sharp on a phone, prints clean on A4. */
export const CERT = { w: 2480, h: 1754 } as const;

export interface UnitCertificateInput {
  studentName: string;
  unitTitle: string;
  courseTitle: string;
  earnedAt: string;
  text: {
    platform: string;
    title: string;
    titleEn: string;
    grantedTo: string;
    forUnit: string;
    /** «بمتوسط ٩٢٪ في كويزات الوحدة», already formatted. */
    average: string;
    teacher: string;
    teacherLabel: string;
    dateLabel: string;
    seal: string;
    siteHost: string;
  };
  qr: QrMatrix;
  hero?: HTMLImageElement;
  /** The uploaded signature (light ink); the name in the script face without one. */
  signature?: HTMLImageElement;
  fonts: CardFonts;
}

/**
 * «شهادة إتمام وحدة»: black and gold with a fire edge, the name in Ruqaa, a
 * seal, the teacher's «signature», and the date. The EXAM certificate is a
 * different object on purpose (`draw-exam-certificate.ts`) — ivory, navy and
 * gold — so the two can never be mistaken for each other in a story.
 *
 * It states only what the platform knows: that this account sat every quiz of
 * this unit and averaged what it says. No serial number pretending to be
 * verifiable — there is no endpoint that could verify one.
 */
export function drawUnitCertificate(canvas: HTMLCanvasElement, input: UnitCertificateInput): void {
  const { w, h } = CERT;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const { fonts, text } = input;
  const cx = w / 2;
  const seed = seedOf(`${input.studentName}|${input.unitTitle}|${input.courseTitle}`);

  ctx.fillStyle = FIRE.ink;
  ctx.fillRect(0, 0, w, h);

  if (input.hero) {
    // His composite as a watermark down the left third, dissolving toward the
    // centre — present, never competing with the name.
    ctx.save();
    ctx.globalAlpha = 0.42;
    drawCover(ctx, input.hero, { x: 0, y: 0, w: 1100, h }, { x: 0.3, y: 0.45 });
    ctx.restore();
    const veil = ctx.createLinearGradient(0, 0, 1100, 0);
    veil.addColorStop(0, 'rgba(7,4,10,0.2)');
    veil.addColorStop(0.75, 'rgba(7,4,10,0.92)');
    veil.addColorStop(1, FIRE.ink);
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, 1100, h);
  }

  const warm = ctx.createRadialGradient(cx, h * 0.46, 60, cx, h * 0.46, 1200);
  warm.addColorStop(0, 'rgba(255,110,0,0.20)');
  warm.addColorStop(1, 'rgba(255,110,0,0)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, w, h);
  drawEmbers(ctx, { x: 0, y: h * 0.45, w, h: h * 0.55 }, seed, 70);

  drawFrame(ctx, w, h);

  // ── Header ──────────────────────────────────────────────────────────────
  ctx.fillStyle = FIRE.gold;
  ctx.font = `400 54px ${fonts.display}`;
  centerText(ctx, text.platform, cx, 238);

  ctx.font = `400 214px ${fonts.display}`;
  ctx.fillStyle = fireGradient(ctx, cx - 600, 300, cx + 600, 480);
  ctx.shadowColor = 'rgba(255,100,0,0.75)';
  ctx.shadowBlur = 60;
  centerText(ctx, text.title, cx, 486);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,201,74,0.75)';
  ctx.font = `600 34px ${fonts.body}`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.fillText(text.titleEn.split('').join(' '), cx, 590);

  // ── The name ────────────────────────────────────────────────────────────
  ctx.fillStyle = FIRE.ash;
  ctx.font = `500 50px ${fonts.body}`;
  centerText(ctx, text.grantedTo, cx, 700);

  const nameSize = fitFontSize(ctx, input.studentName, (s) => `700 ${s}px ${fonts.script}`, 190, 1560, 90);
  ctx.font = `700 ${nameSize}px ${fonts.script}`;
  ctx.fillStyle = FIRE.white;
  ctx.shadowColor = 'rgba(255,170,40,0.55)';
  ctx.shadowBlur = 40;
  centerText(ctx, input.studentName, cx, 925);
  ctx.shadowBlur = 0;
  flourish(ctx, cx, 985, 620);

  // ── The unit ────────────────────────────────────────────────────────────
  ctx.fillStyle = FIRE.ash;
  ctx.font = `500 48px ${fonts.body}`;
  centerText(ctx, text.forUnit, cx, 1066);
  ctx.fillStyle = FIRE.white;
  const unitSize = fitFontSize(ctx, input.unitTitle, (s) => `700 ${s}px ${fonts.body}`, 88, 1600, 48);
  ctx.font = `700 ${unitSize}px ${fonts.body}`;
  centerText(ctx, input.unitTitle, cx, 1160);
  ctx.fillStyle = FIRE.gold;
  ctx.font = `600 42px ${fonts.body}`;
  const courseLine = wrapLines(ctx, input.courseTitle, 1500, 1)[0] ?? '';
  centerText(ctx, courseLine, cx, 1228);
  ctx.fillStyle = FIRE.ash;
  ctx.font = `500 38px ${fonts.body}`;
  centerText(ctx, text.average, cx, 1290);

  // ── Seal, signature, date ───────────────────────────────────────────────
  const rowY = 1500;
  const date = new Date(input.earnedAt);
  const dateText = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
  drawSeal(ctx, cx, rowY, 140, text.seal, Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ar-EG', { year: 'numeric' }), fonts);

  // RTL: the signature sits on the reader's starting side (right).
  const sigX = cx + 600;
  if (input.signature) {
    drawSignature(ctx, input.signature, sigX, rowY + 18, 500, 170);
  } else {
    ctx.fillStyle = FIRE.gold;
    const sigSize = fitFontSize(ctx, text.teacher, (s) => `700 ${s}px ${fonts.script}`, 96, 560, 50);
    ctx.font = `700 ${sigSize}px ${fonts.script}`;
    centerText(ctx, text.teacher, sigX, rowY - 10);
  }
  signatureLine(ctx, sigX, rowY + 26, 520);
  ctx.fillStyle = FIRE.ash;
  ctx.font = `500 36px ${fonts.body}`;
  centerText(ctx, text.teacherLabel, sigX, rowY + 84);

  const dateX = cx - 600;
  ctx.fillStyle = FIRE.white;
  ctx.font = `700 52px ${fonts.body}`;
  centerText(ctx, dateText, dateX, rowY - 14);
  signatureLine(ctx, dateX, rowY + 26, 520);
  ctx.fillStyle = FIRE.ash;
  ctx.font = `500 36px ${fonts.body}`;
  centerText(ctx, text.dateLabel, dateX, rowY + 84);

  // ── Way in ──────────────────────────────────────────────────────────────
  // Bottom-right corner, inside the frame, with the host under it — clear of
  // the seal, which owns the centre of that row.
  const qr = 150;
  const qx = w - 140 - qr;
  const qy = h - 140 - qr - 40;
  drawQr(ctx, input.qr, qx, qy, qr);
  ctx.fillStyle = FIRE.gold;
  ctx.font = `600 28px ${fonts.body}`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.fillText(text.siteHost, qx + qr / 2, qy + qr + 36);
}

function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.strokeStyle = fireGradient(ctx, 0, 0, w, h);
  ctx.lineWidth = 8;
  ctx.shadowColor = 'rgba(255,110,0,0.6)';
  ctx.shadowBlur = 30;
  ctx.strokeRect(56, 56, w - 112, h - 112);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,201,74,0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(84, 84, w - 168, h - 168);

  // Corner pieces: an L of two strokes and a diamond, mirrored into each corner.
  const corners: [number, number, number, number][] = [
    [84, 84, 1, 1],
    [w - 84, 84, -1, 1],
    [84, h - 84, 1, -1],
    [w - 84, h - 84, -1, -1],
  ];
  ctx.strokeStyle = FIRE.gold;
  ctx.fillStyle = FIRE.gold;
  ctx.lineWidth = 4;
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * 24, y + dy * 150);
    ctx.lineTo(x + dx * 24, y + dy * 24);
    ctx.lineTo(x + dx * 150, y + dy * 24);
    ctx.stroke();
    diamond(ctx, x + dx * 24, y + dy * 24, 14);
    diamond(ctx, x + dx * 150, y + dy * 24, 7);
    diamond(ctx, x + dx * 24, y + dy * 150, 7);
  }
  ctx.restore();
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}

function flourish(ctx: CanvasRenderingContext2D, cx: number, y: number, half: number): void {
  ctx.save();
  const g = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
  g.addColorStop(0, 'rgba(255,201,74,0)');
  g.addColorStop(0.5, FIRE.gold);
  g.addColorStop(1, 'rgba(255,201,74,0)');
  ctx.strokeStyle = g;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - half, y);
  ctx.lineTo(cx + half, y);
  ctx.stroke();
  ctx.fillStyle = FIRE.flame;
  ctx.shadowColor = FIRE.flame;
  ctx.shadowBlur = 20;
  diamond(ctx, cx, y, 12);
  ctx.restore();
}

function signatureLine(ctx: CanvasRenderingContext2D, cx: number, y: number, width: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,201,74,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - width / 2, y);
  ctx.lineTo(cx + width / 2, y);
  ctx.stroke();
  ctx.restore();
}

/** A wax-and-fire seal: a toothed rim, two rings, the word and the year. */
function drawSeal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  word: string,
  year: string,
  fonts: CardFonts,
): void {
  ctx.save();
  // Toothed rim.
  ctx.beginPath();
  const teeth = 36;
  for (let i = 0; i <= teeth * 2; i += 1) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.9;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fireGradient(ctx, x - r, y - r, x + r, y + r);
  ctx.shadowColor = 'rgba(255,110,0,0.8)';
  ctx.shadowBlur = 50;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = FIRE.coal;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = FIRE.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([4, 8]);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = fireGradient(ctx, x, y - 50, x, y + 20);
  ctx.font = `400 64px ${fonts.display}`;
  centerText(ctx, word, x, y + 12);
  ctx.fillStyle = FIRE.gold;
  ctx.font = `600 30px ${fonts.body}`;
  centerText(ctx, year, x, y + 58);
  ctx.restore();
}
