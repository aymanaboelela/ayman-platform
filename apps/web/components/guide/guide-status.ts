import { arabicCount } from '@ayman/contracts/arabic-count';
import { AuthPasswordSchema } from '@ayman/contracts/auth';
import { copy } from '@ayman/contracts/copy';
import { guideCopy } from '@ayman/contracts/copy/guide';
import {
  FULL_NAME_ERRORS,
  FULL_NAME_MIN_PARTS,
  fullNameProblem,
  normalizeFullName,
} from '@ayman/contracts/full-name';
import { normalizeEgyptianPhone, toAsciiDigits } from '@ayman/contracts/phone';

/**
 * «الاسم تمام»، «باقي ٣ أرقام» — the live line under the helper's spoken one.
 *
 * ## It states no rule of its own
 *
 * Every answer here comes from the thing the form itself validates with:
 *
 *   · the name   → `fullNameProblem` / `FULL_NAME_MIN_PARTS`, the functions
 *                  `FullNameSchema` is built from;
 *   · the phone  → `normalizeEgyptianPhone`, the function `egyptianPhone()` is;
 *   · the password → `AuthPasswordSchema` ITSELF, asked about a string of the
 *                  same length (see `passwordStatus`).
 *
 * So «تمام» here means the form's submit will accept that field, and the day
 * a rule changes this line changes with it. `guide-status.test.ts` holds each
 * one against the real `RegisterSchema`.
 *
 * ## What it is allowed to know about what was typed
 *
 * These functions are handed the value of ONE field at the moment of a
 * keystroke and return a sentence. Nothing is kept: the caller stores the
 * sentence, never the value, and nothing here logs, sends or caches. The
 * password functions do not take the password at all — a length, and whether
 * the two fields are equal, which is all either sentence can say.
 */

const s = guideCopy.status;

/** `ok` — the form will take it; `todo` — keep going; `bad` — this will be refused. */
export interface FieldStatus {
  tone: 'ok' | 'todo' | 'bad';
  text: string;
}

/** Nothing typed yet: no line, rather than a complaint about an empty field. */
export function nameStatus(value: string): FieldStatus | null {
  const name = normalizeFullName(value);
  if (name === '') return null;
  const problem = fullNameProblem(name);
  if (problem === null) return { tone: 'ok', text: s.nameOk };
  if (problem === FULL_NAME_ERRORS.tooFewParts) {
    const left = FULL_NAME_MIN_PARTS - name.split(' ').length;
    return { tone: 'todo', text: arabicCount(left, s.nameLeft) };
  }
  // A part still one letter long is somebody mid-word, not a mistake.
  if (problem === FULL_NAME_ERRORS.shortPart) return { tone: 'todo', text: problem };
  // Digits, symbols, two scripts, too long: the schema's own sentence for it.
  return { tone: 'bad', text: problem };
}

/**
 * A mobile number the way the form asks for it — its own placeholder,
 * `01012345678`. Its length, its leading digits and the shape the validator
 * turns it into are all read off that one string, not written here.
 */
const SAMPLE_MOBILE = copy.auth.fields.phonePlaceholder;
export const LOCAL_MOBILE_DIGITS = SAMPLE_MOBILE.length;
const MOBILE_LEAD = SAMPLE_MOBILE.slice(0, 2);
const SAMPLE_NORMALIZED = normalizeEgyptianPhone(SAMPLE_MOBILE) ?? '';

/** Normalised to the same shape as the sample: same length, same `+201`. */
function isWholeMobile(normalized: string): boolean {
  return (
    SAMPLE_NORMALIZED !== '' &&
    normalized.length === SAMPLE_NORMALIZED.length &&
    normalized.startsWith(SAMPLE_NORMALIZED.slice(0, 4))
  );
}

/**
 * ⚠️ «الرقم تمام» is deliberately STRICTER than the form here, in one
 * direction only.
 *
 * `normalizeEgyptianPhone` — the form's rule — accepts any valid Egyptian
 * number, and with the slim metadata it runs on that includes `010123456`:
 * nine digits of a mobile number that is still being typed. Saying «تمام»
 * there would be this helper telling a student to stop two digits early, on
 * the field that becomes their sign-in identity. So:
 *
 *   · «تمام» only for a number the validator accepts AND that is a whole
 *     mobile number (the placeholder's shape);
 *   · a count of the digits left while a `01…` number is shorter than that;
 *   · «not a valid mobile» only for something the validator itself refuses —
 *     the helper never calls a number wrong that the form would take;
 *   · silence for anything else (a landline, a `+20…` half-typed).
 *
 * It never says «تمام» about a number the form would refuse; the test holds
 * that against `RegisterSchema`.
 */
export function phoneStatus(value: string): FieldStatus | null {
  if (value.trim() === '') return null;
  const normalized = normalizeEgyptianPhone(value);
  if (normalized !== null && isWholeMobile(normalized)) return { tone: 'ok', text: s.phoneOk };

  const digits = toAsciiDigits(value).replace(/\D/g, '');
  const typingMobile = MOBILE_LEAD.startsWith(digits) || digits.startsWith(MOBILE_LEAD);
  if (typingMobile && digits.length < LOCAL_MOBILE_DIGITS) {
    return { tone: 'todo', text: arabicCount(LOCAL_MOBILE_DIGITS - digits.length, s.phoneLeft) };
  }
  if (normalized === null && digits.length >= LOCAL_MOBILE_DIGITS) return { tone: 'bad', text: s.phoneBad };
  return null;
}

/**
 * Whether `AuthPasswordSchema` accepts a password of this LENGTH — asked of a
 * stand-in string, never of the password. The schema's only rules are a
 * minimum and a maximum length, so a string of the same length gets the same
 * answer; if it ever grows a rule about content, the test that compares this
 * against the real schema is what says so.
 */
function lengthPasses(length: number): boolean {
  return AuthPasswordSchema.safeParse('x'.repeat(length)).success;
}

/** The shortest length the schema accepts — found by asking it, once. */
export const PASSWORD_MIN_LENGTH = (() => {
  for (let length = 1; length <= 64; length += 1) if (lengthPasses(length)) return length;
  return 0;
})();

export function passwordStatus(length: number): FieldStatus | null {
  if (length === 0) return null;
  if (lengthPasses(length)) return { tone: 'ok', text: s.passwordOk };
  if (length < PASSWORD_MIN_LENGTH) {
    return { tone: 'todo', text: arabicCount(PASSWORD_MIN_LENGTH - length, s.passwordLeft) };
  }
  return { tone: 'bad', text: s.passwordLong };
}

/** `RegisterSchema`'s one cross-field rule: the two are the same string. */
export function confirmStatus(length: number, matches: boolean): FieldStatus | null {
  if (length === 0) return null;
  return matches ? { tone: 'ok', text: s.confirmOk } : { tone: 'todo', text: s.confirmBad };
}

/** The fields a live line exists for, by what they are. */
export type StatusKind = 'name' | 'phone' | 'password' | 'confirm';

/** A text field as this module needs it: a value, and the form it sits in. */
interface FieldLike {
  value: string;
  form?: { elements: { namedItem: (name: string) => unknown } } | null;
}

function siblingValue(field: FieldLike, name: string): string {
  const other = field.form?.elements.namedItem(name) as { value?: unknown } | null | undefined;
  return typeof other?.value === 'string' ? other.value : '';
}

/**
 * The live line for the field in front of the student, read from the DOM at
 * the moment of asking. The value is used inside this call and dropped.
 */
export function statusOf(kind: StatusKind, field: FieldLike): FieldStatus | null {
  if (kind === 'name') return nameStatus(field.value);
  if (kind === 'phone') return phoneStatus(field.value);
  if (kind === 'password') return passwordStatus(field.value.length);
  return confirmStatus(field.value.length, field.value === siblingValue(field, 'password'));
}
