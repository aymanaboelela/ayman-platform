import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { tierName } from '@/lib/achievements';
import { statFigures, type StatFigure } from './stats-row';

/**
 * The band's three figures — which numbers they are, what each one says
 * underneath itself, and where each one goes.
 *
 * ## What is actually at risk here
 *
 * Six numbers used to describe this student in two shapes a screen apart, and
 * the fix folded three of them into the other three as second lines. That fold
 * is the whole change, and it is the kind that breaks silently: a wrong pairing
 * prints «٢ كورساتك» under a badge count and nobody notices, because it is
 * still a true sentence about a real student — just an answer to a question
 * nobody asked. So every assertion below pins a PAIR, not a number.
 *
 * The rendering is deliberately not asserted. Everything the design has to get
 * right — the ink tone on ember, three across at 390px, the tier-lit well — is
 * CSS, and a DOM test would pass against three invisible `--n-2` rectangles on
 * the band, which is the exact failure `tone="ink"` exists to prevent.
 *
 * The labels are read from `copy` rather than typed out: this pass added no
 * copy strings and must not quietly fork one, so a test that hard-coded
 * «كورساتك» would go on passing after the table changed underneath it.
 */
const c = copy.dashboard;

const full = {
  xp: 340,
  learningSeconds: 5_400,
  badgesEarned: 3,
  completedLessons: 12,
  courseCount: 2,
  averageScore: 78,
  badgeTier: 'silver' as const,
};

/** Looked up by id rather than by index, so a reordering of the row is caught
 *  by the order test above and nowhere else — every other case here is about
 *  one figure's contents and should not also depend on its position. */
const byId = (input: Parameters<typeof statFigures>[0]) => {
  const figures = statFigures(input);
  const find = (id: StatFigure['id']): StatFigure => {
    const figure = figures.find((candidate) => candidate.id === id);
    if (!figure) throw new Error(`no «${id}» figure on the band`);
    return figure;
  };
  return { xp: find('xp'), time: find('time'), badges: find('badges') };
};

describe('statFigures', () => {
  it('states exactly three figures, in a fixed order', () => {
    // Three, always. There is no branch that adds a fourth or drops one: a
    // student on day one sees three zeros, which is the state they are here to
    // move, not an empty band.
    expect(statFigures(full).map((figure) => figure.id)).toEqual(['xp', 'time', 'badges']);
  });

  it('puts the lessons count under the XP it earned, pointing at the path', () => {
    // XP is computed FROM completed lessons (`lib/xp.ts`), which is why the
    // count belongs here rather than beside it as a separate measurement.
    expect(byId(full).xp).toEqual({
      id: 'xp',
      value: 340,
      label: c.xpLabel,
      note: `12 ${c.statLessonsDone}`,
      href: '/path',
    });
  });

  it('puts the course count under the study time, pointing at the library', () => {
    expect(byId(full).time).toMatchObject({
      label: c.learningHoursLabel,
      note: `2 ${c.statCourses}`,
      href: '/library',
    });
  });

  it('puts the average mark under the badge count, pointing at the results', () => {
    // Badges are earned largely by quiz results (`lib/achievements.ts`), so
    // this pair is causal in the same way the XP one is.
    expect(byId(full).badges).toMatchObject({
      id: 'badges',
      value: 3,
      label: c.badgesEarnedLabel,
      note: `${c.statAverage} 78%`,
      href: '/results',
    });
  });

  it('says «لسه» rather than «٠٪» for a student who has never been graded', () => {
    // `0%` is a mark. `null` is the absence of one, and printing the first for
    // the second tells a student who has sat nothing that they scored nothing.
    expect(byId({ ...full, averageScore: null }).badges.note).toBe(
      `${c.statAverage} ${c.statNoScores}`,
    );
  });

  it('still prints a genuine zero average as a mark', () => {
    // The other half of the same rule: `0` is graded, and must not be coerced
    // into «لسه» by a truthiness check.
    expect(byId({ ...full, averageScore: 0 }).badges.note).toBe(`${c.statAverage} 0%`);
  });

  it('prints minutes for a student under the hour, never a bare «٠»', () => {
    // 12 minutes of watching used to render as `0` — the one figure measuring
    // effort telling a first-session student they had made none.
    expect(byId({ ...full, learningSeconds: 720 }).time.value).toBe('12 د');
  });

  it('prints hours and minutes once past the hour', () => {
    expect(byId(full).time.value).toBe('1 س 30 د');
  });

  it('gives a brand-new student three real zeros rather than blanks', () => {
    const fresh = byId({
      xp: 0,
      learningSeconds: 0,
      badgesEarned: 0,
      completedLessons: 0,
      courseCount: 0,
      averageScore: null,
      badgeTier: null,
    });

    expect(fresh.xp.value).toBe(0);
    expect(fresh.badges.value).toBe(0);
    expect(fresh.time.value).toBe('0 د');
    expect(fresh.xp.note).toBe(`0 ${c.statLessonsDone}`);
  });
});

/**
 * The badge tile's tier — the metal on its well, and the word beside its count.
 *
 * The colour is `.tile--ink.tile--metal` in `study.css` and is not asserted
 * here; a DOM test would pass against a well painted in a metal nobody can
 * name. What IS asserted is that the tile never states a rank in colour alone,
 * because that is the half of the design a screen reader, a greyscale phone
 * and a red-green-blind student all depend on.
 */
describe('statFigures — the badge tier', () => {
  it('names the tier beside the count and strikes the well in its metal', () => {
    const { badges } = byId({ ...full, badgeTier: 'gold' });

    expect(badges.suffix).toBe(tierName('gold'));
    expect(badges.metalClass).toBe('tile--metal badge--gold');
  });

  it('carries the tier NAME, not just its colour', () => {
    // The whole point of the suffix. Bronze against gold is a ~20° hue step on
    // a 390px phone, and no step at all to a screen reader.
    const names = (['bronze', 'silver', 'gold'] as const).map(
      (tier) => byId({ ...full, badgeTier: tier }).badges.suffix,
    );

    expect(names.every((name) => typeof name === 'string' && name.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(3);
  });

  it('says nothing at all about a tier for a student who holds none', () => {
    // Not «برونزية» and not an empty string: a new student has not earned the
    // cheapest badge either, and defaulting to the bottom of the ladder awards
    // one. The well falls back to the band's plain white alpha.
    const { badges } = byId({ ...full, badgeTier: null, badgesEarned: 0 });

    expect(badges.suffix).toBeUndefined();
    expect(badges.metalClass).toBeUndefined();
  });

  it('leaves the other two figures unmetalled whatever the tier', () => {
    // Exactly one coloured well per band. Two would make the colour a pattern
    // rather than a datum, which is the state «شارات محققة» was lifted out of.
    const figures = byId({ ...full, badgeTier: 'gold' });

    expect(figures.xp.metalClass).toBeUndefined();
    expect(figures.time.metalClass).toBeUndefined();
    expect(figures.xp.suffix).toBeUndefined();
    expect(figures.time.suffix).toBeUndefined();
  });
});
