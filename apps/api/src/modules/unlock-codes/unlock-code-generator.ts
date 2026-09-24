import { randomInt } from 'node:crypto';
import { UNLOCK_CODE_ALPHABET, UNLOCK_CODE_LENGTH } from '@ayman/contracts/unlock-codes';

/**
 * Six characters from a 31-letter alphabet: 31⁶ ≈ 887 million codes.
 *
 * `crypto.randomInt`, never `Math.random` and never Postgres `random()` (which
 * the guardian code uses, and which is fine there only because 26 characters
 * bury its predictability). Six characters is short enough to type from a
 * WhatsApp message, so the code has to be unpredictable rather than long —
 * and the attempt ladder in `UnlockAttemptsService` is what makes guessing
 * pointless: at a few hundred live codes and ~20 tries an hour, the odds of a
 * hit are around one in a million per account per hour.
 */
export function generateUnlockCode(): string {
  let code = '';
  for (let index = 0; index < UNLOCK_CODE_LENGTH; index += 1) {
    code += UNLOCK_CODE_ALPHABET[randomInt(UNLOCK_CODE_ALPHABET.length)];
  }
  return code;
}
