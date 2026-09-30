/**
 * «٢ / ٣» — a count out of a total, the way the progress counters print it.
 *
 * Written straight into an RTL page, `2 / 3` came out as «3 / 2»: none of its
 * characters is a strong letter, so the paragraph's own direction decides, and
 * a right-to-left paragraph lays the two numbers out right to left with the
 * slash between them. The spaces are what stop `isolateLtrRuns` from catching
 * it — that helper joins `2/3` into one run, but around ` / ` it wraps each
 * number on its own and the pair still flips.
 *
 * So the whole ratio is one `<bdi dir="ltr">`: the markup form of the
 * `direction: ltr; unicode-bidi: isolate` rule the rest of the app applies to
 * Latin inside Arabic, on the one element that holds both numbers.
 *
 * Its own module on purpose — a new file is always safe for a tab that
 * outlived a deploy, where a new export on an existing one is not.
 */
export function LtrRatio({ value, of }: { value: number; of: number }) {
  return <bdi dir="ltr">{`${value} / ${of}`}</bdi>;
}
