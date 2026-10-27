import type { SocialFacts } from '@ayman/contracts/social/posts';

/** The one line a post is known by in the inbox and on the calendar. */
export function postTitle(facts: SocialFacts): string {
  switch (facts.kind) {
    case 'honor':
      return facts.title;
    case 'results':
      return facts.examTitle;
    case 'certificates':
      return facts.units[0]?.title ?? facts.weekStart;
    case 'course':
    case 'lecture':
    case 'news':
      return facts.title;
  }
}
