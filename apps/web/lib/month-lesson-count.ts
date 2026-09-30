import { copy } from '@ayman/contracts/copy';
import type { ArabicCountForms } from '@ayman/contracts/arabic-count';

/** «محاضرة واحدة / محاضرتين / ٣ محاضرات / ١١ محاضرة» on a month card — the
 *  three places that show one read the same forms from here. */
export function monthLessonForms(): ArabicCountForms {
  return {
    one: copy.subscribe.monthCardLessonsOne,
    two: copy.subscribe.monthCardLessonsTwo,
    few: copy.subscribe.monthCardLessonsFew,
    many: copy.subscribe.monthCardLessons,
  };
}
