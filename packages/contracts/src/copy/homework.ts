/**
 * الواجب — the sentences the instructor picks from when he marks a submission.
 *
 * ## Pools, not strings — the same decision `copy/outreach.ts` documents
 *
 * «يبقى فيه كذا أوبشن قدامي أقدر أختار منه… وطبعا كل مرة تتغير، يعني أنا اللي
 *  أختار من الكلام اللي قدامي عشان ما أقعدش أكتب كتير.» So each verdict is an
 * ARRAY, `pickHomeworkSuggestions` offers three of them per submission, and the
 * seed is the submission's own id — the same screen re-rendered shows the same
 * three (a set that reshuffled under a half-made choice would be unusable) and
 * the next student's shows different ones.
 *
 * He can always type his own. These exist so that the common case — «تمام، شغل
 * حلو» — costs one tap instead of one sentence, thirty times an evening.
 *
 * ## The four rules `copy/outreach.ts` sets, restated because they bind here too
 *
 * **1. Spoken Egyptian.** Short, ordinary, no aphorisms. It is read on a phone
 * by a fifteen-year-old who has just been told their work is coming back.
 *
 * **2. The work always sounds SMALL.** Every `NEEDS_WORK` line names something
 * short and doable. «الحل ده غلط» closes the message and ends the exercise;
 * «قرّبت خالص، فيه حتة صغيرة نظبطها» is what makes them pick the pen up again.
 * That is the whole point of the pool, not a softener on it.
 *
 * **3. He is «مهندس أيمن»** everywhere he is named.
 *
 * **4. Nothing here knows whether it is talking to a boy or a girl.** The
 * platform never asks. Every line below is written with the four devices that
 * file names — first person («شفت حلّك»), the inclusive plural («نراجعها مع
 * بعض»), nominal sentences instead of imperatives («مراجعة صغيرة» not
 * «راجع»), and the ـك suffix on a NOUN («حلّك»، «ورقتك»، «خطك») which is one
 * spelling for both readings. «معاك»، «بيك»، «وراك» grow a ي in the feminine
 * and are banned; so is every imperative and every «إنت …» adjective.
 *
 * `homework.spec.ts` carries the same tripwire `compose.spec.ts` does over
 * these pools.
 *
 * ## No relative imports
 *
 * Reached as `@ayman/contracts/copy/homework` by both apps, same rule as
 * `copy/outreach.ts`.
 */

/** «مقبول» — the answer is right and the exercise is finished. */
export const HOMEWORK_ACCEPTED_NOTES = [
  'شفت حلّك، تمام كده. شغل نضيف والخطوات مظبوطة.',
  'الواجب وصل وصح. مبسوط بالمستوى ده بجد.',
  'حل سليم من أوله لآخره. كده إحنا ماشيين صح.',
  'ممتاز. الطريقة اللي اتحلّت بيها هي اللي أنا شرحتها بالظبط.',
  'تمام أوي. الورقة مرتبة والإجابة مظبوطة، وده اللي بيفرق في الامتحان.',
  'برافو. الواجب ده خلص صح، نكمل اللي بعده.',
  'حلو جدًا. واضح إن المحاضرة اتذاكرت كويس، مش مجرد فرجة.',
  'كله صح. مافيش ولا ملاحظة عندي على الحل ده.',
] as const;

/**
 * «فكّر أكتر وابعته تاني» — the verdict that reopens the exercise.
 *
 * Every line says two things and only two: something in the answer is right,
 * and there is one specific small thing to redo. Nothing here says «غلط» on
 * its own, and nothing here is sarcastic — this is the message a student reads
 * at eleven at night, alone.
 */
export const HOMEWORK_NEEDS_WORK_NOTES = [
  'الحل قرّب خالص، بس فيه حتة صغيرة عايزة تظبيط. ومستني الحل تاني.',
  'البداية مظبوطة والباقي محتاج مراجعة. نراجعها مع بعض، والواجب مفتوح تاني.',
  'الفكرة صح بس الخطوات ناقصة شوية. تفكير تاني في الجزء ده وأنا مستني.',
  'مش بعيد عن الصح. مراجعة صغيرة للخطوة الأخيرة وهيبقى تمام.',
  'الحل عايز تركيز أكتر شوية. رجعة سريعة للمحاضرة، وأنا مستني الحل تاني.',
  'في غلطة صغيرة بتغيّر الناتج كله. تدقيق تاني في الأرقام ومستني النسخة الجديدة.',
  'شفت الورقة — الطريقة سليمة والتطبيق هو اللي اتلخبط. تجربة تانية بهدوء وأنا مستني.',
  'الجزء ده عايز شغل تاني بس. باقي الواجب تمام.',
  'الخط مش واضح في جزء من الورقة، وأنا عايز أشوف الحل كامل. تصوير تاني أوضح لو ينفع.',
] as const;

/**
 * The three the review screen shows, per verdict.
 *
 * THREE and not the whole pool: a wall of eight sentences is a thing to read,
 * and the point of this control is to not read anything. Deterministic in the
 * submission id so the list holds still while he is looking at it.
 */
export const HOMEWORK_SUGGESTION_COUNT = 3;

/**
 * FNV-1a, the same one `outreach/compose.ts` uses and for the same reason: a
 * stable, dependency-free 32-bit hash that turns an id into an offset. Not a
 * security primitive and never used as one.
 */
function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/**
 * `count` entries from `pool`, starting at an offset derived from `seed` and
 * walking forward.
 *
 * A WINDOW rather than `count` independent picks, because independent picks
 * from a small pool collide — two of the three offered would be the same
 * sentence often enough to look broken. Walking forward with a stride of 1
 * from a hashed start gives three distinct entries for any pool of at least
 * three, and moves the whole window for the next submission.
 */
function pickWindow(pool: readonly string[], seed: string, count: number): string[] {
  const size = Math.min(count, pool.length);
  const start = hash(seed) % pool.length;
  return Array.from({ length: size }, (_, index) => pool[(start + index) % pool.length]!);
}

/** What `/admin/homework/[id]` offers for one submission. */
export function pickHomeworkSuggestions(seed: string): {
  accepted: string[];
  needsWork: string[];
} {
  return {
    // Two different seeds off one id: the two lists must not move in lockstep,
    // for the reason `compose.ts` gives about slots — pools that advance
    // together stop being independent.
    accepted: pickWindow(HOMEWORK_ACCEPTED_NOTES, `${seed}:accepted`, HOMEWORK_SUGGESTION_COUNT),
    needsWork: pickWindow(HOMEWORK_NEEDS_WORK_NOTES, `${seed}:needs-work`, HOMEWORK_SUGGESTION_COUNT),
  };
}
