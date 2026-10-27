import { centerText, drawQr, drawSignature, fitFontSize, rng, seedOf, wrapLines, type CardFonts } from './canvas-kit';
import { CERT } from './draw-unit-certificate';
import type { QrMatrix } from './model';

/**
 * «شهادة تفوّق» — the EXAM certificate, and deliberately a different object
 * from the unit certificate: «شهادة الكويز تبقى شكلها مختلف عن شهادة
 * الامتحان». The unit one burns (black, fire, embers); this one is the formal
 * document — ivory paper, a navy band, gold foil, a laurel wreath around the
 * mark and a red wax seal — so a story of either is recognisable at a glance.
 *
 * Same canvas size as the unit certificate (A4 landscape), so the PDF wrapper
 * and the dialog treat both the same.
 */
export interface ExamCertificateInput {
  studentName: string;
  examTitle: string;
  courseTitle: string;
  score: number;
  total: number;
  earnedAt: string;
  text: {
    platform: string;
    title: string;
    titleEn: string;
    grantedTo: string;
    forExam: string;
    /** «من ٢٠», already formatted — printed under the score in the wreath. */
    scoreOf: string;
    teacher: string;
    teacherLabel: string;
    dateLabel: string;
    seal: string;
    siteHost: string;
  };
  qr: QrMatrix;
  /** The uploaded signature (dark ink); the name in the script face without one. */
  signature?: HTMLImageElement;
  fonts: CardFonts;
}

const PAPER = {
  light: '#fbf6ea',
  mid: '#f1e5c8',
  edge: '#e3d1a6',
  navy: '#14213d',
  navySoft: 'rgba(20,33,61,0.62)',
  wax: '#9b1c1c',
  waxDark: '#5e0e0e',
} as const;

function goldFoil(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#9c6b17');
  g.addColorStop(0.28, '#f3d27a');
  g.addColorStop(0.5, '#b8862a');
  g.addColorStop(0.72, '#f7dd94');
  g.addColorStop(1, '#8f5f12');
  return g;
}

export function drawExamCertificate(canvas: HTMLCanvasElement, input: ExamCertificateInput): void {
  const { w, h } = CERT;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const { fonts, text } = input;
  const cx = w / 2;
  const seed = seedOf(`${input.studentName}|${input.examTitle}|${input.score}`);

  // ── Paper ───────────────────────────────────────────────────────────────
  const paper = ctx.createRadialGradient(cx, h * 0.45, 200, cx, h * 0.5, w * 0.75);
  paper.addColorStop(0, PAPER.light);
  paper.addColorStop(0.7, PAPER.mid);
  paper.addColorStop(1, PAPER.edge);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  // Fibre: a few thousand faint specks, seeded so the paper never shimmers
  // between two renders of the same certificate.
  const rand = rng(seed);
  ctx.fillStyle = 'rgba(120,90,40,0.05)';
  for (let i = 0; i < 2600; i += 1) ctx.fillRect(rand() * w, rand() * h, 1.6, 1.6);

  drawGuilloche(ctx, w, h);
  drawBorder(ctx, w, h);

  // ── Header ──────────────────────────────────────────────────────────────
  ctx.fillStyle = PAPER.navy;
  ctx.font = `400 54px ${fonts.display}`;
  centerText(ctx, text.platform, cx, 250);
  sprig(ctx, cx - 330, 232, -1);
  sprig(ctx, cx + 330, 232, 1);

  ctx.font = `400 200px ${fonts.display}`;
  // Embossed foil: a navy shadow a few pixels down, the foil on top.
  ctx.fillStyle = 'rgba(20,33,61,0.35)';
  centerText(ctx, text.title, cx + 3, 466);
  ctx.fillStyle = goldFoil(ctx, cx - 520, 300, cx + 520, 470);
  centerText(ctx, text.title, cx, 460);

  ctx.fillStyle = PAPER.navy;
  ctx.font = `600 32px ${fonts.body}`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.fillText(text.titleEn.split('').join(' '), cx, 548);

  // ── Name ────────────────────────────────────────────────────────────────
  ctx.fillStyle = PAPER.navySoft;
  ctx.font = `500 46px ${fonts.body}`;
  centerText(ctx, text.grantedTo, cx, 650);
  const nameSize = fitFontSize(ctx, input.studentName, (s) => `700 ${s}px ${fonts.script}`, 176, 1500, 90);
  ctx.font = `700 ${nameSize}px ${fonts.script}`;
  ctx.fillStyle = PAPER.navy;
  centerText(ctx, input.studentName, cx, 858);
  rule(ctx, cx, 912, 560);

  // ── Exam ────────────────────────────────────────────────────────────────
  ctx.fillStyle = PAPER.navySoft;
  ctx.font = `500 46px ${fonts.body}`;
  centerText(ctx, text.forExam, cx, 1000);
  ctx.fillStyle = PAPER.navy;
  const examSize = fitFontSize(ctx, input.examTitle, (s) => `700 ${s}px ${fonts.body}`, 78, 1500, 44);
  ctx.font = `700 ${examSize}px ${fonts.body}`;
  centerText(ctx, input.examTitle, cx, 1090);
  ctx.fillStyle = '#8f5f12';
  ctx.font = `600 40px ${fonts.body}`;
  centerText(ctx, wrapLines(ctx, input.courseTitle, 1400, 1)[0] ?? '', cx, 1152);

  // ── Wreath with the mark ────────────────────────────────────────────────
  const my = 1418;
  wreath(ctx, cx, my, 176, seed);
  ctx.fillStyle = PAPER.navy;
  ctx.beginPath();
  ctx.arc(cx, my, 128, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = goldFoil(ctx, cx - 130, my - 130, cx + 130, my + 130);
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.fillStyle = goldFoil(ctx, cx - 90, my - 90, cx + 90, my + 30);
  const scoreText = input.score.toLocaleString('ar-EG', { maximumFractionDigits: 1 });
  const scoreSize = fitFontSize(ctx, scoreText, (s) => `400 ${s}px ${fonts.display}`, 120, 200, 60);
  ctx.font = `400 ${scoreSize}px ${fonts.display}`;
  centerText(ctx, scoreText, cx, my + 26);
  ctx.fillStyle = PAPER.light;
  ctx.font = `600 34px ${fonts.body}`;
  centerText(ctx, text.scoreOf, cx, my + 78);

  // ── Signature and date ──────────────────────────────────────────────────
  const rowY = 1470;
  const date = new Date(input.earnedAt);
  const valid = !Number.isNaN(date.getTime());
  const sigX = cx + 620;
  if (input.signature) {
    drawSignature(ctx, input.signature, sigX, rowY + 18, 480, 160);
  } else {
    ctx.fillStyle = PAPER.navy;
    const sigSize = fitFontSize(ctx, text.teacher, (s) => `700 ${s}px ${fonts.script}`, 92, 540, 48);
    ctx.font = `700 ${sigSize}px ${fonts.script}`;
    centerText(ctx, text.teacher, sigX, rowY - 10);
  }
  rule(ctx, sigX, rowY + 26, 250, false);
  ctx.fillStyle = PAPER.navySoft;
  ctx.font = `500 34px ${fonts.body}`;
  centerText(ctx, text.teacherLabel, sigX, rowY + 80);

  const dateX = cx - 620;
  ctx.fillStyle = PAPER.navy;
  ctx.font = `700 50px ${fonts.body}`;
  centerText(ctx, valid ? date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) : '', dateX, rowY - 14);
  rule(ctx, dateX, rowY + 26, 250, false);
  ctx.fillStyle = PAPER.navySoft;
  ctx.font = `500 34px ${fonts.body}`;
  centerText(ctx, text.dateLabel, dateX, rowY + 80);

  // ── Wax seal, top corner; QR, bottom corner ─────────────────────────────
  waxSeal(ctx, w - 330, 340, 118, text.seal, fonts, seed);
  const qr = 140;
  drawQr(ctx, input.qr, 150, h - 150 - qr - 36, qr);
  ctx.fillStyle = PAPER.navy;
  ctx.font = `600 26px ${fonts.body}`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.fillText(text.siteHost, 150 + qr / 2, h - 150 - 2);
}

/** Banknote-style rosette lines in the margin band — the «official paper» texture. */
function drawGuilloche(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(20,33,61,0.07)';
  ctx.lineWidth = 1.4;
  for (let k = 0; k < 9; k += 1) {
    const phase = (k / 9) * Math.PI * 2;
    for (const [y0, y1] of [
      [120, 168],
      [h - 168, h - 120],
    ] as const) {
      ctx.beginPath();
      for (let x = 120; x <= w - 120; x += 6) {
        const y = (y0 + y1) / 2 + Math.sin(x / 38 + phase) * ((y1 - y0) / 2);
        if (x === 120) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBorder(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.strokeStyle = PAPER.navy;
  ctx.lineWidth = 26;
  ctx.strokeRect(60, 60, w - 120, h - 120);
  ctx.strokeStyle = goldFoil(ctx, 0, 0, w, h);
  ctx.lineWidth = 5;
  ctx.strokeRect(92, 92, w - 184, h - 184);
  ctx.strokeStyle = PAPER.navySoft;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(104, 104, w - 208, h - 208);
  for (const [x, y] of [
    [92, 92],
    [w - 92, 92],
    [92, h - 92],
    [w - 92, h - 92],
  ] as const) {
    rosette(ctx, x, y, 30);
  }
  ctx.restore();
}

function rosette(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.fillStyle = goldFoil(ctx, x - r, y - r, x + r, y + r);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.22, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = PAPER.navy;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function rule(ctx: CanvasRenderingContext2D, cx: number, y: number, half: number, ornament = true): void {
  ctx.save();
  ctx.strokeStyle = goldFoil(ctx, cx - half, y, cx + half, y);
  ctx.lineWidth = ornament ? 4 : 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - half, y);
  ctx.lineTo(cx + half, y);
  ctx.stroke();
  if (ornament) {
    ctx.fillStyle = PAPER.navy;
    ctx.beginPath();
    ctx.moveTo(cx, y - 12);
    ctx.lineTo(cx + 12, y);
    ctx.lineTo(cx, y + 12);
    ctx.lineTo(cx - 12, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** A short laurel sprig beside the platform line; `dir` mirrors it. */
function sprig(ctx: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1): void {
  ctx.save();
  const foil = goldFoil(ctx, x - 140, y - 40, x + 140, y + 40);
  // A gently curved stem running away from the title…
  ctx.strokeStyle = foil;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + dir * 90, y - 14, x + dir * 190, y + 4);
  ctx.stroke();
  // …with leaves alternating above and below it, leaning back toward the tip.
  ctx.fillStyle = foil;
  for (let i = 0; i < 6; i += 1) {
    const t = (i + 0.5) / 6;
    const lx = x + dir * t * 185;
    const ly = y - Math.sin(t * Math.PI) * 9;
    const side = i % 2 === 0 ? -1 : 1;
    const size = 20 - t * 6;
    ctx.beginPath();
    ctx.ellipse(lx + dir * 6, ly + side * 11, size, size * 0.42, dir * (side * -0.9), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Two arcs of gold leaves closing under the mark, open at the top. */
function wreath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, seed: number): void {
  const rand = rng(seed ^ 0x5eed);
  ctx.save();
  ctx.fillStyle = goldFoil(ctx, cx - r, cy - r, cx + r, cy + r);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 13; i += 1) {
      // From the bottom (90°) up to ~-40° on each side.
      const t = i / 12;
      const a = Math.PI / 2 + side * (t * (Math.PI * 0.72));
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      const size = 30 - t * 10 + rand() * 4;
      for (const off of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(
          x + Math.cos(a) * off * 16,
          y + Math.sin(a) * off * 16,
          size,
          size * 0.38,
          a + side * (Math.PI / 2) + off * 0.5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/** Red wax with an irregular rim, a pressed ring and the word, plus two ribbon tails. */
function waxSeal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  word: string,
  fonts: CardFonts,
  seed: number,
): void {
  const rand = rng(seed ^ 0xa11);
  ctx.save();
  // Ribbons first, under the wax.
  ctx.fillStyle = PAPER.navy;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * 30, y + 40);
    ctx.lineTo(x + side * 80, y + r + 120);
    ctx.lineTo(x + side * 50, y + r + 96);
    ctx.lineTo(x + side * 20, y + r + 130);
    ctx.lineTo(x + side * -10, y + 40);
    ctx.closePath();
    ctx.fill();
  }
  // The blob.
  ctx.beginPath();
  for (let i = 0; i <= 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    const rr = r * (0.94 + rand() * 0.1);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const wax = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 10, x, y, r);
  wax.addColorStop(0, '#c43434');
  wax.addColorStop(0.6, PAPER.wax);
  wax.addColorStop(1, PAPER.waxDark);
  ctx.fillStyle = wax;
  ctx.shadowColor = 'rgba(60,10,10,0.45)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,220,220,0.28)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(x, y + 3, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,225,215,0.92)';
  ctx.font = `400 58px ${fonts.display}`;
  centerText(ctx, word, x, y + 20);
  ctx.restore();
}
