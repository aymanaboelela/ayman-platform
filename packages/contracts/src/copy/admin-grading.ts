/**
 * «تصحيح الورق» — the marking screen's own words, for the parts of it that
 * can CHANGE what a student already has: their recorded answer, a stored mark,
 * and the paper's total.
 *
 * ## Why this screen needed a vocabulary of its own
 *
 * The 2026-10-15 redesign made every option row of a choice question a click
 * target. One stray click silently swapped the student's recorded answer and
 * rewrote the mark under it, and «حفظ» then wrote both — on a screen the
 * instructor scrolls through thirty times an evening. «لو دوست بالغلط لازم
 * يسألني متأكد إنك عايز تعدّل؟ مايتغيّرش على طول.» So the rows are read-only
 * now, editing an answer is a mode you enter on purpose, and any save that
 * overwrites a stored answer or mark first says what it is about to change,
 * old value beside new.
 *
 * Its own module rather than more keys on `copy.admin.grading`: a key added
 * to an existing module is `undefined` in a tab that outlived the deploy
 * (Turbopack keeps the old factory for the old path), and this is a screen
 * an instructor leaves open for an evening.
 *
 * ## The voice
 *
 * The admin screens follow the student rule since #180 — masdar on buttons
 * («حفظ»، «تعديل»), first person plural for a question («نحفظ التعديل ده؟»),
 * and nothing that genders the student it describes.
 */
export const adminGrading = {
  /** The verdict chip on each card, from the row's stored state. */
  correctness: {
    correct: 'إجابة صحيحة',
    incorrect: 'إجابة غلط',
    partial: 'صح جزئيًا',
    needs_grading: 'محتاج تصحيح',
  },

  /* ── a choice question, read-only ───────────────────────────────────── */
  optionsTitle: 'الاختيارات',
  studentChoice: 'اختيار الطالب',
  rightOption: 'الإجابة الصحيحة',
  /** A choice question the student left blank — as a fact about the paper,
   *  not a sentence about the student. */
  unanswered: 'السؤال ده اتساب من غير إجابة.',
  /** An ordering answer, shown as the sequence the student put down. */
  studentOrder: 'ترتيب الطالب',
  rightOrder: 'الترتيب الصحيح',

  /* ── editing the recorded answer, on purpose ─────────────────────────── */
  editAnswer: 'تعديل إجابة الطالب',
  cancelEdit: 'إلغاء التعديل',
  /** Shown while the options are live, so the mode cannot be mistaken for
   *  the read-only view it replaced. */
  editHint: 'اختيار الإجابة اللي هتتسجّل للطالب. مفيش حاجة بتتحفظ غير بعد «حفظ» والتأكيد.',
  /** Picking an option suggests the mark it is worth — said, because the
   *  mark box changing on its own is exactly the kind of silent edit this
   *  screen stopped making. */
  markSuggested: 'الدرجة اتعدّلت على حسب الاختيار الجديد — ممكن تتغيّر قبل الحفظ.',

  /* ── the mark ────────────────────────────────────────────────────────── */
  quickFull: 'الدرجة كاملة ({n})',
  quickHalf: 'نص الدرجة ({n})',
  quickZero: 'صفر',
  feedbackPlaceholder: 'ملاحظة أو توجيه على السؤال ده…',
  save: 'حفظ',
  saving: 'بنحفظ…',

  /* ── «نحفظ التعديل ده؟» ──────────────────────────────────────────────── */
  confirmTitle: 'نحفظ التعديل ده؟',
  confirmBody: 'ده هيغيّر اللي متسجّل للطالب دلوقتي:',
  confirmAnswer: 'الإجابة',
  confirmMark: 'الدرجة',
  /** `{from}` `{to}` — the screen-reader sentence for one changed row; the
   *  visible row is the two values with an arrow between them. */
  confirmChange: 'من {from} لـ {to}',
  /** The «before» of an answer that was blank, or a mark nobody gave yet. */
  confirmNone: 'من غير إجابة',
  confirmUnmarked: 'من غير درجة',
  /** `{mark}` of `{max}`. */
  confirmMarkValue: '{mark} من {max}',
  /** `{value}` — a row the save does NOT change, said as such: an answer
   *  swapped for another wrong one leaves the mark where it was, and a struck
   *  «0 من 1» beside the same «0 من 1» reads as a change. */
  confirmSame: 'من غير تغيير: {value}',
  confirmAction: 'أيوه، نحفظ',
  confirmCancel: 'رجوع',

  /* ── the paper's total ───────────────────────────────────────────────── */
  overrideOpen: 'تعديل المجموع',
  overrideLabel: 'المجموع الجديد',
  overrideOutOf: 'من {n}',
  overrideSave: 'حفظ المجموع',
  overrideCancel: 'إلغاء',
  overrideConfirmTitle: 'نغيّر مجموع الورقة؟',
  /** `{from}` `{to}` `{outOf}`. The second sentence is the honest caveat:
   *  marking any question afterwards recomputes the total from the questions
   *  (`recomputeScoreTx`) and the override does not survive it. */
  overrideConfirmBody:
    'المجموع هيتغيّر من {from} لـ {to} من {outOf}، والنجاح هيتحسب على الرقم الجديد. ولو أي سؤال اتصحّح بعد كده، المجموع بيتحسب من الأسئلة تاني.',
  overrideInvalid: 'المجموع لازم يكون رقم من 0 لـ {outOf}.',
  overrideFailed: 'مقدرناش نغيّر المجموع — نجرّب تاني.',
  overrideSaved: 'المجموع اتغيّر',

  /* ── the filter over the paper's questions ───────────────────────────── */
  filterLabel: 'عرض',
  filterAll: 'كل الأسئلة ({n})',
  filterPending: 'محتاج تصحيح ({n})',
  filterWrong: 'الإجابات الغلط ({n})',
  filterCorrect: 'الإجابات الصح ({n})',
  filterEmpty: 'مفيش أسئلة في الفلتر ده.',
} as const;

export type AdminGradingCopy = typeof adminGrading;
