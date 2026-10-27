import { create as createQr } from 'qrcode';

/**
 * What the two share images need, resolved on the SERVER and handed to the
 * client dialog as plain props.
 *
 * The teacher's name, the site's host and the hero art all go through the
 * tenant gates before they get here (`tenantName`, `getBrandAsset`), so the
 * canvas code below never decides whose identity a picture carries: on a
 * teacher's stack `heroSrc` is simply `undefined` and the card draws its own
 * fire instead of Ayman's dragon.
 */
export interface ShareBrand {
  teacher: string;
  platform: string;
  /** `aymanaboelela.com` — printed under the QR, so it has no scheme. */
  siteHost: string;
  /** The hero composite (his face + the dragon), his stack only. */
  heroSrc?: string;
  qr: QrMatrix;
}

/** A QR as rows of booleans, built on the server so no encoder ships to the phone. */
export interface QrMatrix {
  size: number;
  /** Row-major, `size * size` long. Plain array so it survives the RSC boundary. */
  bits: boolean[];
}

export interface ResultCardData {
  studentName: string;
  examTitle: string;
  score: number;
  total: number;
}

export function qrMatrix(text: string): QrMatrix {
  // `M`, as on the centre attendance card: survives a thumb over a corner of a
  // story screenshot and keeps the matrix small enough to scan off a phone.
  const { modules } = createQr(text, { errorCorrectionLevel: 'M' });
  const bits: boolean[] = [];
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) bits.push(Boolean(modules.get(row, col)));
  }
  return { size: modules.size, bits };
}

export type Tier = 'perfect' | 'legendary' | 'high' | 'onTrack';

/**
 * Which headline a score earns, or `null` when it should not be shared at all.
 *
 * Below half there is no card. A story reading «٥ من ٢٠» under the teacher's
 * name advertises the opposite of what the card is for, and a student who
 * scored it would not post it anyway — offering the button would only be a
 * reminder.
 */
export function tierFor(score: number, total: number): Tier | null {
  if (!(total > 0) || !(score >= 0)) return null;
  const ratio = score / total;
  if (ratio >= 1) return 'perfect';
  if (ratio >= 0.9) return 'legendary';
  if (ratio >= 0.75) return 'high';
  if (ratio >= 0.5) return 'onTrack';
  return null;
}
