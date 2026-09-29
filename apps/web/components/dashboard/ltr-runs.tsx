import type { ReactNode } from 'react';

/**
 * «الدرسان 1-1 و 1-2» rendered as «… 1-1 و 2-1», and «أعلى درجة 45%» as
 * «أعلى درجة %45» — both on the dashboard, both from the same rule. After an
 * Arabic letter the bidi algorithm types a digit as an ARABIC number; a hyphen
 * does not join two Arabic numbers the way it joins two European ones, and a
 * percent sign after one is laid out on the wrong side of it.
 *
 * So every run of Latin letters and digits — joined by `-` `.` `/` `:`, with a
 * trailing `%` — is wrapped in `<bdi dir="ltr">`: the markup form of the
 * `direction: ltr; unicode-bidi: isolate` rule the rest of the app applies to
 * Latin inside Arabic. For text whose numbers arrive inside one string — a
 * topic name the instructor typed, a formatted `copy` line — where a CSS class
 * on a separate element is not an option.
 *
 * A string with no such run comes back as the same string, not an array, so
 * `getByText` and friends see exactly what they saw before.
 */
const LTR_RUN = /([0-9A-Za-z]+(?:[-./:][0-9A-Za-z]+)*%?)/;

export function isolateLtrRuns(text: string): ReactNode {
  const parts = text.split(LTR_RUN);
  if (parts.length === 1) return text;
  // `split` with a capture group puts every match at an odd index.
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <bdi key={index} dir="ltr">
        {part}
      </bdi>
    ) : (
      part
    ),
  );
}
