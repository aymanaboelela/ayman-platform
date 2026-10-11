/**
 * «ساحة التحدي» — مين يلعب قدام مين، وعلى أنهي أسئلة. بيور زي
 * `arena-engine.ts`: مفيش Redis ولا Prisma هنا.
 */

/**
 * الدفعة اللي الطابور بيتقسم عليها: النظام × السنة × عربي/لغات — بالظبط.
 *
 * ⚠️ ده مش `CohortRankService.cohort`، اللي بيدخّل البروفايل اللي نظامه
 * NULL مع سنته كلها عشان «ترتيبي» مايبقاش «الأول من خمسة». هنا المطلوب
 * العكس: تانية عربي تلعب مع تانية عربي، واللغات مع اللغات — فاللي نظامه أو
 * نوع مدرسته مش معروف بيلعب مع اللي زيه بس، بدل ما يتحط قدام دفعة غير دفعته.
 */
export interface ArenaCohort {
  systemId: string | null;
  year: number;
  stream: 'general' | 'languages' | null;
}

/**
 * طابور واحد = كورس واحد × دفعة واحدة — وتحدّي واحد لو الكورس فيه «تحديات»
 * (اللي اختار «الوحدة الأولى» بيتقابل مع اللي اختارها بس).
 */
export function queueKeyOf(courseId: string, cohort: ArenaCohort, topicId?: string | null): string {
  const base = [courseId, cohort.systemId ?? '-', cohort.year, cohort.stream ?? '-'].join('|');
  return topicId ? `${base}|t:${topicId}` : base;
}

/** طابور تحدّي طالب مفتوح — عضو واحد (صاحبه) لحد ما حد يقبله. */
export function challengeQueueKey(challengeId: string): string {
  return `c:${challengeId}`;
}

export interface QueueMember {
  userId: string;
  /** دخل الطابور إمتى — الأقدم الأول. */
  since: number;
}

/**
 * أقدم اتنين **مختلفين** لسه موجودين، واللي مابقاش موجود (النبض وقف) بيتشال.
 *
 * الطابور sorted set عضوه الـuserId، فالطالب اللي فاتح تابين هو عضو واحد —
 * عمره ما بيتقابل مع نفسه. الشرط `a.userId !== b.userId` هنا شبكة تانية تحت
 * دي، مش الأولى.
 */
export function pickPair(
  members: readonly QueueMember[],
  alive: (userId: string) => boolean,
): { pair: [QueueMember, QueueMember] | null; stale: string[] } {
  const ordered = [...members].sort((a, b) => a.since - b.since || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  const stale: string[] = [];
  const ready: QueueMember[] = [];
  const seen = new Set<string>();
  for (const member of ordered) {
    if (seen.has(member.userId)) continue;
    seen.add(member.userId);
    if (!alive(member.userId)) stale.push(member.userId);
    else ready.push(member);
  }
  const [a, b] = ready;
  return { pair: a && b && a.userId !== b.userId ? [a, b] : null, stale };
}

export interface PoolItem {
  versionId: string;
  /** نسبة الصح على المنصة كلها — `null` لو مفيش إجابات كفاية. */
  facility: number | null;
  /** «صيغ لنفس الفكرة» — صيغة واحدة بس في الماتش. */
  variantGroupKey?: string | null;
  bankEntryId?: string;
}

/**
 * أسئلة الماتش من بنكين.
 *
 * الأول من اللي في البنكين (الاتنين حلّوا الكويز ده، أو من أسئلة الألعاب
 * بتاعة الكورس اللي في بنك الكل)، والباقي من اللي في بنك واحد بس — عشان
 * الماتش مايقصرش لما واحد فيهم حل كويزات أكتر من التاني. وبعدين من الأسهل
 * للأصعب، زي أي مسابقة.
 */
export function pickQuestions<T extends PoolItem>(
  a: readonly T[],
  b: readonly T[],
  count: number,
  random: () => number = Math.random,
  /**
   * الترتيب جوّه كل مجموعة (اللي في البنكين، واللي في بنك واحد). من غيره
   * عشوائي؛ معاه — `freshFirst` بـ«شافوه إمتى» بتاع الاتنين — اللي محدش فيهم
   * شافه الأول.
   */
  order?: (items: T[]) => T[],
): T[] {
  const inB = new Map(b.map((item) => [item.versionId, item]));
  const both: T[] = [];
  const either = new Map<string, T>();
  for (const item of a) {
    if (inB.has(item.versionId)) both.push(item);
    else either.set(item.versionId, item);
  }
  for (const item of b) if (!both.some((x) => x.versionId === item.versionId)) either.set(item.versionId, item);

  const arrange = order ?? ((items: T[]) => shuffle(items, random));
  // صيغتين لنفس الفكرة مايدخلوش نفس الماتش — حتى لو واحدة في البنكين والتانية في بنك واحد.
  const groups = new Set<string>();
  const picked: T[] = [];
  for (const item of [...arrange(both), ...arrange([...either.values()])]) {
    if (picked.length >= count) break;
    const group = item.variantGroupKey ? `g:${item.variantGroupKey}` : null;
    if (group && groups.has(group)) continue;
    if (group) groups.add(group);
    picked.push(item);
  }
  return picked.sort((x, y) => (y.facility ?? 0.55) - (x.facility ?? 0.55));
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * أول لحظة في يوم القاهرة اللي فيه `now` — لسقف نقط اليوم.
 *
 * بـIntl مش بفرق ثابت: مصر رجعت للتوقيت الصيفي، فالفرق ساعتين في الشتا وتلاتة
 * في الصيف، وسقف بيتصفّر الساعة ٢ أو ٣ الصبح بتوقيتنا مش «النهارده».
 */
export function cairoDayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offset = Math.round((wall - Math.floor(now.getTime() / 1000) * 1000) / 60_000) * 60_000;
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')) - offset);
}
