import { createHash } from 'node:crypto';
import { GAME_LETTERS_AR, GAME_LETTERS_EN } from '@ayman/contracts/quiz/game';

/**
 * The text side of the Millionaire voice, shared by the API (`GameVoiceService`)
 * and the offline recorder (`scripts/record-game-voice.ts`). Both MUST derive
 * the same text and the same storage key from a question, or every recorded
 * clip is a file nobody ever asks for — so the derivation lives here once.
 *
 * Kept free of Nest and Prisma so the recorder can import it on a laptop.
 */

/** The letters on the screen (`millionaire.tsx`), one clip each. */
export const LETTERS: readonly string[] = GAME_LETTERS_AR;
/** …and on an English question (`isEnglishQuestion`), part `letter-en-<n>`. */
export const LETTERS_EN: readonly string[] = GAME_LETTERS_EN;

/**
 * How the recorder SAYS each letter. A lone «أ» sent to a TTS engine comes back
 * as a grunt; the letter's name is what a quiz host actually says.
 */
export const LETTER_NAMES = ['ألِف', 'بَا', 'جِيم', 'دَال', 'هَا', 'وَاو'];
/** A bare «A» is read as the article «uh»; with a full stop it is the letter. */
export const LETTER_NAMES_EN = ['A.', 'B.', 'C.', 'D.', 'E.', 'F.'];

/**
 * The line before each question, in the host's Egyptian. Varied so fifteen
 * questions in a row do not open on the same sentence; the last two say where
 * the student is on the ladder because that is what the show does.
 *
 * No imperative to the student («ركّز») — it is masculine, and the platform
 * never assumes (CLAUDE.md §7).
 */
export const INTROS = [
  'السؤال الأول.. يلا نبدأ..',
  'السؤال التاني..',
  'السؤال التالت.. يلا بينا..',
  'السؤال الرابع..',
  'السؤال الخامس.. وده مهم..',
  'السؤال السادس..',
  'السؤال السابع.. يلا..',
  'السؤال التامن..',
  'السؤال التاسع..',
  'السؤال العاشر.. لسه مكمّلين..',
  'السؤال الحداشر..',
  'السؤال الاتناشر..',
  'السؤال التلاتاشر.. قرّبنا..',
  'السؤال الأربعتاشر.. فاضل سؤال..',
  'السؤال الأخير.. سؤال المليون..',
];

/** The intro for question `n` (1-based); past the list, a plain number. */
export function introText(n: number): string {
  return INTROS[n - 1] ?? `السؤال رقم ${n}..`;
}

/** Plain text from question HTML — tags and entities never reach a voice. */
export function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Where a pre-recorded clip of `text` lives in media storage. Keyed on the
 * SCREEN text, not on what was spoken: an Arabic question may be recorded in
 * an Egyptian rewording, and the server only knows the stored question. An
 * edited question hashes to a new key, finds nothing, and falls back — it can
 * never play the old wording.
 */
export function libraryKey(text: string): string {
  return `game-voice/library/${createHash('sha256').update(`library|${text}`).digest('hex')}.mp3`;
}
