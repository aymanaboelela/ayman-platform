import { captionCopy as c } from '@ayman/contracts/copy/social-posts';
import { SOCIAL_CAPTION_MAX, type SocialFacts, type SocialPerson } from '@ayman/contracts/social/posts';

/**
 * Everything a caption needs that is not in the facts — all of it resolved by
 * the API through the tenant gates before it gets here.
 */
export interface CaptionContext {
  /** `tenantName(copy.site.platformName)` — never a literal. */
  platform: string;
  /** This deployment's own site, e.g. `https://example.com`. */
  siteUrl: string;
  /** The page this post points at, absolute. */
  link: string;
  /** The admin's own tags from the connection screen, space-separated. */
  extraHashtags: string;
  /** `TEACHES_CODE` — a programming stack gets the subject tag. */
  teachesCode: boolean;
}

export const num = (n: number): string => n.toLocaleString('ar-EG', { maximumFractionDigits: 1 });

function personLine(person: SocialPerson, index: number): string {
  const place = person.rank ?? index + 1;
  const marker = c.medals[place - 1] ?? `${num(place)}.`;
  const mark =
    person.score !== null && person.total !== null && person.total > 0
      ? ` — ${c.scoreOf(num(person.score), num(person.total))}`
      : '';
  return `${marker} ${person.name}${mark}`;
}

/**
 * «#مذاكرة #تفوق» — kind tags, then the stack's, then the admin's, each once.
 *
 * The admin's string is split on whitespace and every token is forced to
 * start with «#», so «مذاكرة, تفوق» typed without the marks still comes out
 * as two tags rather than a sentence glued to the end of the caption.
 */
export function hashtags(kindTags: readonly string[], context: CaptionContext): string {
  const extra = context.extraHashtags
    .split(/[\s,،]+/)
    .map((tag) => tag.trim().replace(/^#+/, ''))
    .filter(Boolean)
    .map((tag) => `#${tag}`);
  const all = [...kindTags, ...c.baseTags, ...(context.teachesCode ? c.codeTags : []), ...extra];
  return [...new Set(all)].join(' ');
}

function body(facts: SocialFacts, context: CaptionContext): { lines: string[]; tags: readonly string[] } {
  switch (facts.kind) {
    case 'honor':
      return {
        lines: [
          c.honor.head(facts.title),
          '',
          c.honor.lead,
          ...facts.people.map(personLine),
          '',
          c.honor.outro,
        ],
        tags: c.honor.tags,
      };
    case 'results':
      return {
        lines: [
          c.results.head(facts.examTitle),
          facts.courseTitle,
          '',
          c.results.stats(num(facts.takers), num(facts.averagePercent), num(facts.passRate)),
          ...(facts.fullMarks > 0 ? [c.results.fullMarks(num(facts.fullMarks))] : []),
          ...(facts.top.length > 0 ? ['', c.results.topLead, ...facts.top.map(personLine)] : []),
          '',
          c.results.outro,
        ],
        tags: c.results.tags,
      };
    case 'certificates':
      return {
        lines: [
          c.certificates.head(num(facts.total), context.platform),
          '',
          ...facts.units.map((unit) => c.certificates.unit(unit.title, num(unit.count))),
          ...(facts.people.length > 0
            ? ['', c.certificates.people(facts.people.map((person) => person.name).join('، '))]
            : []),
          '',
          c.certificates.rule,
        ],
        tags: c.certificates.tags,
      };
    case 'course':
      return {
        lines: [
          c.course.head(context.platform),
          '',
          c.course.title(facts.title),
          ...(facts.subtitle ? [facts.subtitle] : []),
          '',
          `${c.course.cta} ${context.link}`,
        ],
        tags: c.course.tags,
      };
    case 'lecture':
      return {
        lines: [
          c.lecture.head,
          '',
          facts.title,
          c.lecture.within(facts.courseTitle, facts.sectionTitle),
          '',
          `${c.lecture.cta} ${context.link}`,
        ],
        tags: c.lecture.tags,
      };
    case 'news':
      return {
        lines: [c.news.head(facts.title), '', facts.excerpt, '', `${c.news.cta} ${context.link}`],
        tags: c.news.tags,
      };
  }
}

/**
 * The suggested caption for a post: the kind's lines, a follow line for the
 * kinds that do not already end on a link, and the hashtags.
 *
 * Clipped to Instagram's limit rather than refused — an excerpt pasted from
 * a long article is the only way to get near it, and a caption that is
 * slightly short beats a publish that fails.
 */
export function composeCaption(facts: SocialFacts, context: CaptionContext): string {
  const { lines, tags } = body(facts, context);
  const endsOnLink = facts.kind === 'course' || facts.kind === 'lecture' || facts.kind === 'news';
  const all = [...lines, ...(endsOnLink ? [] : ['', c.follow(context.platform, context.siteUrl)]), '', hashtags(tags, context)];
  const text = all
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > SOCIAL_CAPTION_MAX ? `${text.slice(0, SOCIAL_CAPTION_MAX - 1)}…` : text;
}
