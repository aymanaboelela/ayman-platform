import type { ExamSignalType } from '../quiz/exam-signals';

/**
 * «أعرف هو عمل كوبي بيست، ولو طلع برا الصفحة» — the panel on the marking
 * screen that shows what the exam runner noticed.
 *
 * Its own module for the reason `admin-grading.ts` gives: a key added to an
 * existing copy module is `undefined` in an admin tab that outlived the deploy.
 *
 * ## The voice
 *
 * Masdar for every event («لصق»، «خروج من التاب»), never a verb with a subject,
 * because a verb would gender the student it describes. And the lead says
 * plainly that these are signs to read, not a finding, because a phone
 * notification takes a student off the tab exactly the way a chatbot does.
 */
export const examSignals = {
  title: 'متابعة الامتحان',
  lead: 'اتسجّلت من غير ما الطالب يشوف حاجة. دي علامات تقراها مش حُكم: إشعار على الموبايل بيودّي الصفحة لورا زي أي تطبيق تاني بالظبط.',
  clean: 'مفيش لصق ولا خروج من الامتحان.',
  /** The chips over the timeline. `{n}` is a count. */
  pastes: 'لصق {n}',
  copies: 'نسخ {n}',
  leaves: 'خروج {n}',
  /** `{t}` is a duration from `formatAway`. */
  away: 'برا الامتحان {t}',
  /** Only shown above one: a single open is the ordinary case. */
  opens: 'فتح الورقة {n} مرات',
  /** What each row of the timeline says happened. */
  types: {
    paste: 'لصق نص',
    copy: 'نسخ نص',
    hidden: 'خروج من التاب',
    visible: 'رجوع للتاب',
    blur: 'شباك تاني فوق الامتحان',
    focus: 'رجوع للشباك',
    pagehide: 'قفل الصفحة أو تحديثها',
    left: 'انتقال لصفحة تانية في الموقع',
    opened: 'فتح الورقة',
  } satisfies Record<ExamSignalType, string>,
  /** `{n}` is the 1-based question number the paper printed. */
  question: 'سؤال {n}',
  /** `{n}` characters in the pasted or copied text. */
  chars: '{n} حرف',
  /** `{t}` from `formatAway`, on a return row. */
  after: 'بعد {t}',
  textLabel: 'النص',
  /** Durations. Western digits, the rule every number on these screens follows. */
  seconds: '{s} ث',
  minutes: '{m} د {s} ث',
  hours: '{h} س {m} د',
  showAll: 'كل التفاصيل ({n})',
  /** On a row of the results list. `{n}` pastes, copies and leaves together. */
  rowBadge: 'لصق أو خروج {n}',
} as const;
