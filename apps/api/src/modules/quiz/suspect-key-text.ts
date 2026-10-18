import { stemExcerpt } from './question-removal.service';

/**
 * The picked option's text and the key's, as the `suspect_key` notification
 * and the admin band both print them.
 *
 * Its own file rather than a method on `KeyWatchService` because the
 * notification feed needs it at read time, and `KeyWatchService` already
 * depends on `NotificationsService` — the other direction would be a cycle.
 */
export function optionTexts(
  version: { options: readonly { id: string; bodyHtml: string; fraction: number }[] },
  pickedOptionId: string,
): { picked: string; key: string } {
  const picked = version.options.find((option) => option.id === pickedOptionId);
  const keyed = version.options.filter((option) => option.fraction > 0);
  return {
    picked: picked ? stemExcerpt(picked.bodyHtml) : '',
    // Several on a multi-answer question; joined the way Arabic lists them.
    key: keyed.map((option) => stemExcerpt(option.bodyHtml)).join('، '),
  };
}
