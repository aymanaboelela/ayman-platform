import { firstNameOf } from '@ayman/contracts/outreach/compose';
import { LINK_TOKEN, NAME_TOKEN } from '@ayman/contracts/marketing/campaign';

/**
 * One campaign template + one recipient → the exact text that leaves the
 * phone.
 *
 * Its own module rather than a function in `campaign.ts` because it reaches
 * `firstNameOf`, which lives in `outreach/compose` and drags the whole Arabic
 * copy pool in behind it. The admin FORM imports the schemas; only the server
 * imports this. Same reasoning as `whatsapp.ts`'s note about the assistant
 * widget — a module that ends up in every bundle is a decision, not an
 * accident.
 *
 * ## Missing name is not «يا طالب»
 *
 * A pasted number has no name, and the fallback for `{{الاسم}}` is to remove
 * the token and tidy the space it leaves — not to substitute a placeholder
 * word. Every generic Arabic vocative is gendered, and this platform does not
 * know and does not ask (see the seeded landing copy's own note). «أهلاً
 * {{الاسم}}» becoming «أهلاً» is correct; becoming «أهلاً يا طالب» is a guess
 * that is wrong for half the cohort.
 */

export interface RenderInput {
  body: string;
  /** Full name; the first word is used. `null` for a pasted number. */
  name: string | null;
  linkUrl: string | null;
}

/**
 * Trailing spaces before a newline, runs of spaces, and three-or-more
 * newlines — all of which a removed token leaves behind and none of which
 * anybody typed.
 */
function tidy(text: string): string {
  return text
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

export function renderCampaignBody({ body, name, linkUrl }: RenderInput): string {
  const first = name ? firstNameOf(name) : '';
  let text = body.split(NAME_TOKEN).join(first);

  if (text.includes(LINK_TOKEN)) {
    text = text.split(LINK_TOKEN).join(linkUrl ?? '');
  } else if (linkUrl) {
    // Its own paragraph, so WhatsApp's link preview attaches to something
    // that reads as a link rather than to a word in the middle of a sentence.
    text = `${text}\n\n${linkUrl}`;
  }

  return tidy(text);
}

/**
 * The one word a recipient can send back to never hear from this again.
 *
 * Matched case-insensitively against the whole trimmed message, plus the two
 * spellings people actually type. Deliberately NOT a substring match: a
 * student writing «مش هقف عن المذاكرة» has not opted out, and treating them
 * as if they had is a silent, unrecoverable unsubscribe.
 */
const STOP_WORDS = ['قف', 'وقف', 'إلغاء', 'الغاء', 'stop', 'unsubscribe'];

export function isOptOutMessage(text: string): boolean {
  const normalised = text
    .trim()
    .toLowerCase()
    // Arabic tatweel and the trailing punctuation people add to a one-word reply.
    .replace(/[ـ.!؟?]/gu, '')
    .trim();
  return STOP_WORDS.includes(normalised);
}
