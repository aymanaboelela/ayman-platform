import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  ARENA_RULES,
  type ArenaAnswerResult,
  type ArenaBeat,
  type ArenaFx,
  type ArenaLobby,
  type ArenaView,
} from '@ayman/contracts/arena';
import {
  abort,
  advance,
  answer as judge,
  createMatch,
  disconnect,
  leave as walkOut,
  nextDueAt,
  reconnect,
  sideOf,
  viewFor,
  type EngineEvent,
  type MatchState,
  type Side,
} from './arena-engine';
import type { ArenaKv } from './arena-kv';
import { pickPair, queueKeyOf } from './arena-matchmaking';
import type { ArenaRealtime } from './arena-realtime';
import {
  ARENA_ACCESS,
  ARENA_CLOCK,
  ARENA_KV,
  ARENA_QUESTIONS,
  ARENA_REALTIME,
  ARENA_RECORDS,
  type ArenaAccessPort,
  type ArenaQuestionsPort,
  type ArenaRecordsPort,
} from './arena.ports';

/** مفاتيح Redis — كلها تحت `arena:` عشان ماتتلخبطش مع الثروتلر ولا الإشعارات. */
const K = {
  match: (id: string) => `arena:m:${id}`,
  user: (id: string) => `arena:u:${id}`,
  queue: (key: string) => `arena:q:${key}`,
  queues: 'arena:queues',
  live: 'arena:live',
  due: 'arena:due',
  beat: (id: string) => `arena:beat:${id}`,
  streams: (id: string) => `arena:streams:${id}`,
  gone: (id: string) => `arena:gone:${id}`,
  lock: (name: string) => `arena:lock:${name}`,
} as const;

const MIN = 60_000;
/** ماتش شغّال عمره ما بيعدّي ٥ دقايق؛ ٣٠ سقف أمان مش توقيت. */
const MATCH_TTL = 30 * MIN;
/** ماتش خلص بيفضل شوية عشان اللي رجع يلاقي شاشة النتيجة. */
const ENDED_TTL = 10 * MIN;
const POINTER_TTL = 30 * MIN;
const QUEUE_TTL = 10 * MIN;
const SET_TTL = 60 * MIN;
/** الستريم بيجدّد العدّاد كل ٥ ثواني؛ بروسيس مات = العدّاد بيختفي لوحده. */
const STREAM_TTL = 20_000;
const GONE_TTL = MIN;
/** ستريم اتقفل وبيرجع (EventSource بيعيد لوحده) — مانقولش «النت قطع» على طول. */
const OFFLINE_DEBOUNCE_MS = 2_500;
/** أقل من كده والماتش مالوش لازمة. */
const MIN_MATCH_QUESTIONS = 3;
const SWEEP_MS = 250;
const QUEUE_SWEEP_MS = 2_000;
const LOCK_TTL_MS = 5_000;
const LOCK_WAIT_MS = 3_000;

type Pointer =
  | {
      kind: 'queue';
      key: string;
      courseId: string;
      courseTitle: string;
      cohortLabel: string;
      since: number;
      name: string;
      image: string | null;
    }
  | { kind: 'match'; matchId: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * «ساحة التحدي» — الطابور، والماتش، والنبض، والساعة.
 *
 * `arena-engine.ts` هو اللي بيحكم؛ ده اللي بيحمّل الماتش من Redis تحت قفل،
 * يديله الوقت، يحفظه، ويبعت لكل لاعب الشاشة من ناحيته. كل تغيير في ماتش بيعدّي
 * من `withLock('m:<id>')`، فإجابتين في نفس اللحظة (حتى لو على كونتينرين)
 * بيتحكموا واحدة ورا التانية.
 *
 * ## الساعة
 *
 * كل ماتش شغّال ليه ميعاد في `arena:due` (sorted set): نهاية المرحلة، أو
 * نهاية مهلة النت، أو بعد ثانية بالكتير عشان النبض يتقري. سويبر كل ربع ثانية
 * بيسحب اللي ميعاده جه — ومش مهم أنهي بروسيس بيعمله، لأن القفل واحد.
 *
 * ## ريستارت
 *
 * كل بروسيس ليه `bootId`. وهو بيقفل (SIGTERM، `enableShutdownHooks`) بيقفل
 * ماتشاته «اتقطع» ويبعت للاتنين. ولو مات من غير ما يلحق، أول بروسيس بعده
 * بيلاقي ماتشات بـ`bootId` تاني في `arena:live` وبيعمل نفس الحاجة. في
 * الحالتين الطالب اللي الستريم بتاعه رجع بيلاقي «الماتش اتقطع» مش شاشة
 * واقفة. الطابور بيعيش عادي: اللي لسه بيبعت نبض بيفضل فيه.
 */
@Injectable()
export class ArenaService implements OnApplicationBootstrap, BeforeApplicationShutdown, OnApplicationShutdown {
  private readonly logger = new Logger(ArenaService.name);
  readonly bootId = randomUUID();
  private sweepTimer: NodeJS.Timeout | null = null;
  private queueTimer: NodeJS.Timeout | null = null;
  private sweeping = false;
  private queueSweeping = false;
  /** الستريمات المفتوحة على البروسيس ده — بتتقفل بإيدنا وهو بيقفل. */
  private readonly streams = new Set<() => void>();

  constructor(
    @Inject(ARENA_KV) private readonly kv: ArenaKv,
    @Inject(ARENA_REALTIME) private readonly realtime: ArenaRealtime,
    @Inject(ARENA_ACCESS) private readonly access: ArenaAccessPort,
    @Inject(ARENA_QUESTIONS) private readonly questions: ArenaQuestionsPort,
    @Inject(ARENA_RECORDS) private readonly records: ArenaRecordsPort,
    @Inject(ARENA_CLOCK) private readonly clock: () => number,
  ) {}

  // ── دورة حياة البروسيس ──────────────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    // السبكس بتنده السويبر بإيدها — تايمر شغّال في جيست بيسيب هاندل مفتوح.
    if (process.env.NODE_ENV === 'test' && process.env.ARENA_TIMERS !== 'on') return;
    try {
      await this.closeOrphans();
    } catch (error) {
      this.logger.warn(`boot cleanup failed: ${(error as Error).message}`);
    }
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.queueTimer = setInterval(() => void this.sweepQueues(), QUEUE_SWEEP_MS);
    this.sweepTimer.unref();
    this.queueTimer.unref();
  }

  /**
   * SIGTERM (ديبلوي). `before…` مش `on…`: Nest بيقفل سيرفر الـHTTP **بين**
   * الاتنين، والسيرفر مابيقفلش وفيه ستريمات مفتوحة — فكود في
   * `onApplicationShutdown` كان هيستنى لحد ما Docker يقتل البروسيس بعد ١٠
   * ثواني، ومايشتغلش أبدًا. هنا الماتشات بتتقفل «اتقطع» وتتبعت للاتنين
   * والستريم لسه مفتوح، وبعدين ستريمات الساحة بتتقفل بإيدنا.
   *
   * لو ده ماكملش (SIGKILL، كراش)، أول بوت بعده بيعمل نفس الحاجة
   * (`closeOrphans`).
   */
  async beforeApplicationShutdown(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    if (this.queueTimer) clearInterval(this.queueTimer);
    this.sweepTimer = null;
    this.queueTimer = null;
    let closed = 0;
    try {
      // الماتشات بتاعتي بس — لو فيه بروسيس جديد قام قبلي، اللي عمله هو بتاعه.
      for (const id of await this.kv.smembers(K.live)) {
        await this.withLock(`m:${id}`, async () => {
          const state = await this.loadMatch(id);
          if (!state || state.end || state.bootId !== this.bootId) return;
          await this.commit(state, abort(state, this.clock()));
          closed += 1;
        }).catch(() => undefined);
      }
    } catch (error) {
      this.logger.warn(`shutdown cleanup failed: ${(error as Error).message}`);
    }
    // الفريم بيلف على Redis pub/sub قبل ما يوصل الستريم — لحظة عشان يلحق.
    if (closed > 0) await sleep(400);
    for (const close of [...this.streams]) close();
    this.streams.clear();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.realtime.close();
  }

  /** الكنترولر بيسجّل كل ستريم بيفتحه، عشان يتقفل وقت الإغلاق. */
  trackStream(close: () => void): () => void {
    this.streams.add(close);
    return () => this.streams.delete(close);
  }

  /** ماتشات بروسيس قبلي فضلت شغّالة (مات من غير ما يقفلها) — «اتقطع». */
  async closeOrphans(): Promise<number> {
    let closed = 0;
    for (const id of await this.kv.smembers(K.live)) {
      await this.withLock(`m:${id}`, async () => {
        const state = await this.loadMatch(id);
        if (!state) {
          await this.forget(id);
          return;
        }
        if (state.end || state.bootId === this.bootId) return;
        await this.commit(state, abort(state, this.clock()));
        closed += 1;
      });
    }
    return closed;
  }

  // ── اللوبي والطابور ─────────────────────────────────────────────────────

  async lobby(userId: string): Promise<ArenaLobby> {
    const eligibility = await this.access.eligibility(userId);
    const [view, me, board] = await Promise.all([
      this.currentView(userId, true),
      this.records.me(userId, eligibility.cohort),
      this.records.board(userId, eligibility.cohort, eligibility.cohortLabel),
    ]);
    return {
      cohort: eligibility.cohort ? { label: eligibility.cohortLabel } : null,
      blocked: eligibility.blocked,
      courses: eligibility.courses,
      me: { ...me, name: eligibility.name, image: eligibility.image },
      view,
      board,
      at: this.clock(),
    };
  }

  /** «يلا نبدأ». طالب واحد = طابور واحد أو ماتش واحد، مهما فتح تابات. */
  async join(userId: string, courseId: string): Promise<ArenaView> {
    const key = await this.withLock(`u:${userId}`, async () => {
      const pointer = await this.pointer(userId);
      if (pointer?.kind === 'match') {
        const state = await this.loadMatch(pointer.matchId);
        if (state && !state.end) return null; // لسه في ماتش — يكمّله
      }

      const eligibility = await this.access.eligibility(userId);
      if (!eligibility.cohort) throw new ForbiddenException({ code: 'no_year' });
      if (eligibility.blocked) throw new ForbiddenException({ code: eligibility.blocked });
      const course = eligibility.courses.find((entry) => entry.id === courseId && entry.playable);
      if (!course) throw new ForbiddenException({ code: 'course_not_playable' });

      const next = queueKeyOf(courseId, eligibility.cohort);
      const now = this.clock();
      if (pointer?.kind === 'queue' && pointer.key !== next) await this.kv.zrem(K.queue(pointer.key), userId);
      const since = pointer?.kind === 'queue' && pointer.key === next ? pointer.since : now;
      const entry: Pointer = {
        kind: 'queue',
        key: next,
        courseId,
        courseTitle: course.title,
        cohortLabel: eligibility.cohortLabel,
        since,
        name: eligibility.name,
        image: eligibility.image,
      };
      await this.setPointer(userId, entry);
      await this.kv.set(K.beat(userId), String(now), ARENA_RULES.beatTtlMs);
      // علامة «الستريم اتقفل» من صفحة قبلها (ريلود، تاب اتقفل) مالهاش معنى
      // وهو لسه داس «يلا نبدأ» — من غير المسح ده، السويبر كان بيشيله من
      // الطابور في اللحظة اللي بين الـPOST وفتح الستريم الجديد.
      await this.kv.del(K.gone(userId));
      await this.kv.zadd(K.queue(next), since, userId, QUEUE_TTL);
      await this.kv.sadd(K.queues, next, SET_TTL);
      return next;
    });

    if (key) {
      await this.tryPair(key);
      const view = await this.currentView(userId, false);
      if (view.phase === 'queued') await this.send(userId, 'queued', view);
      return view;
    }
    return this.currentView(userId, false);
  }

  /** «إلغاء» / «خروج» من الطابور. ماتش شغّال مابيتلغيش من هنا — ده «انسحاب». */
  async cancel(userId: string): Promise<ArenaView> {
    return this.withLock(`u:${userId}`, async () => {
      const pointer = await this.pointer(userId);
      if (pointer?.kind === 'queue') {
        await this.kv.zrem(K.queue(pointer.key), userId);
        await this.kv.del(K.user(userId));
        await this.send(userId, 'left_queue', { phase: 'idle' });
        return { phase: 'idle' } as const;
      }
      if (pointer?.kind === 'match') {
        const state = await this.loadMatch(pointer.matchId);
        if (!state || state.end) {
          await this.kv.del(K.user(userId));
          return { phase: 'idle' } as const;
        }
      }
      return this.currentView(userId, false);
    });
  }

  /** أقدم اتنين في الطابور ده لسه موجودين = ماتش. */
  async tryPair(key: string): Promise<boolean> {
    const pair = await this.withLock(`q:${key}`, async () => {
      const members = (await this.kv.zall(K.queue(key))).map(({ member, score }) => ({ userId: member, since: score }));
      const alive = new Set<string>();
      for (const member of members) if (await this.queuedAndAlive(member.userId, key)) alive.add(member.userId);
      const picked = pickPair(members, (id) => alive.has(id));
      for (const id of picked.stale) await this.dropFromQueue(id, key);
      if (!picked.pair) return null;
      for (const member of picked.pair) await this.kv.zrem(K.queue(key), member.userId);
      return picked.pair;
    });
    if (!pair) return false;
    return this.startMatch(key, [pair[0].userId, pair[1].userId], [pair[0].since, pair[1].since]);
  }

  // ── الماتش ─────────────────────────────────────────────────────────────

  /** `receivedAt` = لحظة ما الطلب وصل الكنترولر — دي اللي بتحكم «مين الأول». */
  async answer(
    userId: string,
    matchId: string,
    index: number,
    optionId: string,
    receivedAt: number,
  ): Promise<ArenaAnswerResult> {
    return this.withLock(`m:${matchId}`, async () => {
      const state = await this.loadMatch(matchId);
      const side = state ? sideOf(state, userId) : null;
      // مش في الماتش ده = الماتش مش موجود بالنسباله. نفس ٤٠٤ بتاع ماتش مش موجود.
      if (!state || side === null) throw new NotFoundException();
      const { result, events } = judge(state, side, index, optionId, receivedAt);
      if (events.length > 0 || result === 'right' || result === 'wrong') await this.commit(state, events);
      return { result, view: { phase: 'match', match: viewFor(state, side) } };
    });
  }

  /** «انسحاب» — الماتش للتاني على طول. */
  async leave(userId: string, matchId: string): Promise<ArenaView> {
    return this.withLock(`m:${matchId}`, async () => {
      const state = await this.loadMatch(matchId);
      const side = state ? sideOf(state, userId) : null;
      if (!state || side === null) throw new NotFoundException();
      const events = walkOut(state, side, this.clock());
      if (events.length > 0) await this.commit(state, events);
      return { phase: 'match', match: viewFor(state, side) };
    });
  }

  /** نبضة المتصفح كل `beatMs` وهو في الطابور أو في ماتش. */
  async beat(userId: string): Promise<ArenaBeat> {
    const now = this.clock();
    await this.kv.set(K.beat(userId), String(now), ARENA_RULES.beatTtlMs);
    const pointer = await this.pointer(userId);
    if (pointer?.kind === 'queue') {
      await this.kv.expire(K.user(userId), POINTER_TTL);
      await this.kv.expire(K.queue(pointer.key), QUEUE_TTL);
      return { at: now, phase: 'queued' };
    }
    if (pointer?.kind === 'match') {
      // لو كان متعلّم «النت قطع»، السويبر يشوفه دلوقتي مش بعد ثانية.
      await this.kv.zadd(K.due, now, pointer.matchId, SET_TTL);
      return { at: now, phase: 'match' };
    }
    return { at: now, phase: 'idle' };
  }

  // ── الستريم ────────────────────────────────────────────────────────────

  /** فريمات الطالب ده، من أي بروسيس. لازم الدالة اللي بترجع تتنده لما الستريم يتقفل. */
  subscribe(userId: string, listener: Parameters<ArenaRealtime['subscribe']>[1]): () => void {
    return this.realtime.subscribe(userId, listener);
  }

  /** ستريم اتفتح: الطالب موجود، والشاشة اللي لازم تترسم دلوقتي. */
  async streamOpened(userId: string): Promise<ArenaView> {
    const now = this.clock();
    await this.kv.incr(K.streams(userId), STREAM_TTL);
    await this.kv.del(K.gone(userId));
    await this.kv.set(K.beat(userId), String(now), ARENA_RULES.beatTtlMs);
    const pointer = await this.pointer(userId);
    if (pointer?.kind === 'match') await this.kv.zadd(K.due, now, pointer.matchId, SET_TTL);
    return this.currentView(userId, false);
  }

  async streamAlive(userId: string): Promise<void> {
    await this.kv.expire(K.streams(userId), STREAM_TTL);
  }

  async streamClosed(userId: string): Promise<void> {
    const left = await this.kv.decr(K.streams(userId));
    if (left > 0) return;
    const now = this.clock();
    await this.kv.del(K.streams(userId));
    await this.kv.set(K.gone(userId), String(now), GONE_TTL);
    const pointer = await this.pointer(userId);
    if (pointer?.kind === 'match') {
      await this.kv.zadd(K.due, now + OFFLINE_DEBOUNCE_MS, pointer.matchId, SET_TTL);
    }
  }

  // ── السويبر ────────────────────────────────────────────────────────────

  /** كل ماتش جه ميعاده. بيتنده من التايمر، ومن السبكس بإيدها. */
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const ids = await this.kv.zdue(K.due, this.clock(), 25);
      for (const id of ids) {
        await this.tick(id).catch((error: Error) => this.logger.warn(`arena tick ${id}: ${error.message}`));
      }
    } catch (error) {
      this.logger.warn(`arena sweep: ${(error as Error).message}`);
    } finally {
      this.sweeping = false;
    }
  }

  /** كل طابور: شيل اللي مشي، وقابل اللي فاضل. */
  async sweepQueues(): Promise<void> {
    if (this.queueSweeping) return;
    this.queueSweeping = true;
    try {
      for (const key of await this.kv.smembers(K.queues)) {
        await this.tryPair(key).catch((error: Error) => this.logger.warn(`arena pair ${key}: ${error.message}`));
      }
    } catch (error) {
      this.logger.warn(`arena queue sweep: ${(error as Error).message}`);
    } finally {
      this.queueSweeping = false;
    }
  }

  /** ماتش واحد: مين متصل، وأي انتقال جه ميعاده. */
  async tick(matchId: string): Promise<void> {
    await this.withLock(`m:${matchId}`, async () => {
      const state = await this.loadMatch(matchId);
      if (!state) {
        await this.forget(matchId);
        return;
      }
      if (state.end) {
        await this.forget(matchId);
        return;
      }
      const now = this.clock();
      if (state.bootId !== this.bootId) {
        await this.commit(state, abort(state, now));
        return;
      }
      const events: EngineEvent[] = [];
      for (const side of [0, 1] as const) {
        const userId = state.players[side].userId;
        const online = await this.isOnline(userId, now);
        if (online === state.players[side].online) continue;
        // سطر لكل قطع ورجوع — «الماتش راح بالانسحاب» من غير سبب مكتوب مالوش تشخيص.
        this.logger.log(`arena ${state.id}: ${userId} ${online ? 'back' : 'offline'} (${await this.presence(userId, now)})`);
        events.push(...(online ? reconnect(state, side, now) : disconnect(state, side, now)));
      }
      events.push(...advance(state, now));
      if (events.length > 0) await this.commit(state, events);
      else await this.schedule(state, now);
    });
  }

  // ── جوّه ───────────────────────────────────────────────────────────────

  private async startMatch(key: string, userIds: [string, string], since: [number, number]): Promise<boolean> {
    const [a, b] = await Promise.all([this.pointer(userIds[0]), this.pointer(userIds[1])]);
    const valid = (p: Pointer | null): p is Extract<Pointer, { kind: 'queue' }> => p?.kind === 'queue' && p.key === key;
    if (!valid(a) || !valid(b)) {
      // واحد لغى في اللحظة دي — التاني يرجع مكانه في الطابور.
      if (valid(a)) await this.kv.zadd(K.queue(key), since[0], userIds[0], QUEUE_TTL);
      if (valid(b)) await this.kv.zadd(K.queue(key), since[1], userIds[1], QUEUE_TTL);
      return false;
    }

    let questions: Awaited<ReturnType<ArenaQuestionsPort['build']>> = [];
    try {
      questions = await this.questions.build(a.courseId, userIds, ARENA_RULES.questions);
    } catch (error) {
      this.logger.warn(`arena questions for ${a.courseId}: ${(error as Error).message}`);
    }
    if (questions.length < MIN_MATCH_QUESTIONS) {
      for (const id of userIds) {
        await this.kv.del(K.user(id));
        await this.send(id, 'no_questions', { phase: 'idle' });
      }
      return false;
    }

    const now = this.clock();
    const state = createMatch({
      id: randomUUID(),
      bootId: this.bootId,
      courseId: a.courseId,
      courseTitle: a.courseTitle,
      cohortLabel: a.cohortLabel,
      players: [
        { userId: userIds[0], name: a.name, image: a.image },
        { userId: userIds[1], name: b.name, image: b.image },
      ],
      questions,
      now,
    });
    await this.saveMatch(state);
    await this.kv.sadd(K.live, state.id, SET_TTL);
    for (const id of userIds) await this.setPointer(id, { kind: 'match', matchId: state.id });
    await this.schedule(state, now);
    await this.publish(state, 'matched');
    return true;
  }

  /**
   * بعد أي تغيير: لو خلص يتكتب في Postgres (مرة واحدة)، يتحفظ، يتجدول،
   * ويتبعت للاتنين — بالترتيب ده، عشان اللي بيقرا بعد الفريم يلاقي نفس الحالة.
   */
  private async commit(state: MatchState, events: EngineEvent[]): Promise<void> {
    const now = this.clock();
    if (state.end && !state.awards) {
      try {
        state.awards = await this.records.record(state);
      } catch (error) {
        this.logger.error(`arena record ${state.id}: ${(error as Error).message}`);
        state.awards = [
          { points: 0, capped: false, total: null },
          { points: 0, capped: false, total: null },
        ];
      }
      state.seq += 1;
    }
    await this.saveMatch(state);
    await this.schedule(state, now);
    for (const side of [0, 1] as const) {
      await this.send(state.players[side].userId, fxFor(state, events, side), {
        phase: 'match',
        match: viewFor(state, side),
      });
    }
  }

  private async publish(state: MatchState, fx: ArenaFx): Promise<void> {
    for (const side of [0, 1] as const) {
      await this.send(state.players[side].userId, fx, { phase: 'match', match: viewFor(state, side) });
    }
  }

  private async send(userId: string, fx: ArenaFx, view: ArenaView): Promise<void> {
    try {
      await this.realtime.publish(userId, { type: 'view', at: this.clock(), fx, view });
    } catch (error) {
      // الفريم ضاع = الشاشة هتتصلّح مع اللي بعده. الماتش نفسه اتحفظ.
      this.logger.warn(`arena publish to ${userId}: ${(error as Error).message}`);
    }
  }

  private async schedule(state: MatchState, now: number): Promise<void> {
    const due = nextDueAt(state, now);
    if (due === null) {
      await this.forget(state.id);
      return;
    }
    await this.kv.zadd(K.due, due, state.id, SET_TTL);
  }

  /** الماتش مابقاش شغّال — مايتسحبش تاني. الحالة نفسها بتفضل لحد الـTTL. */
  private async forget(matchId: string): Promise<void> {
    await this.kv.zrem(K.due, matchId);
    await this.kv.srem(K.live, matchId);
  }

  private async currentView(userId: string, forLobby: boolean): Promise<ArenaView> {
    const pointer = await this.pointer(userId);
    if (pointer?.kind === 'queue') {
      const inQueue = (await this.kv.zall(K.queue(pointer.key))).some((entry) => entry.member === userId);
      if (!inQueue) return { phase: 'idle' };
      return {
        phase: 'queued',
        courseId: pointer.courseId,
        courseTitle: pointer.courseTitle,
        cohortLabel: pointer.cohortLabel,
        since: pointer.since,
      };
    }
    if (pointer?.kind === 'match') {
      const state = await this.loadMatch(pointer.matchId);
      const side = state ? sideOf(state, userId) : null;
      if (!state || side === null) return { phase: 'idle' };
      // اللوبي بعد ماتش خلص = اللوبي، مش شاشة النتيجة تاني.
      if (state.end && forLobby) return { phase: 'idle' };
      return { phase: 'match', match: viewFor(state, side) };
    }
    return { phase: 'idle' };
  }

  private async queuedAndAlive(userId: string, key: string): Promise<boolean> {
    const pointer = await this.pointer(userId);
    if (pointer?.kind !== 'queue' || pointer.key !== key) return false;
    return this.isOnline(userId, this.clock());
  }

  private async dropFromQueue(userId: string, key: string): Promise<void> {
    await this.kv.zrem(K.queue(key), userId);
    const pointer = await this.pointer(userId);
    if (pointer?.kind === 'queue' && pointer.key === key) await this.kv.del(K.user(userId));
  }

  /**
   * متصل = فيه نبضة من آخر `beatTtlMs`، ومفيش ستريم **اتقفل** من أكتر من
   * ثانيتين ونص من غير ما واحد تاني يتفتح.
   *
   * النبضة هي اللي بتلقط موبايل النت قطع عنده من غير ما الـTCP يتقفل (السوكت
   * بيفضل «مفتوح» عندنا دقايق). الستريم اللي اتقفل هو اللي بيلقط تاب اتقفل أو
   * صفحة اتسابت — أسرع من النبضة. والمهلة الصغيرة عشان EventSource بيعيد
   * لوحده، ومانقولش «النت قطع» على رعشة.
   *
   * ستريم لسه ماتفتحش خالص (الـPOST سبق الـEventSource بمللي ثانية) مش قطع.
   */
  private async isOnline(userId: string, now: number): Promise<boolean> {
    if (!(await this.kv.exists(K.beat(userId)))) return false;
    const streams = Number((await this.kv.get(K.streams(userId))) ?? 0);
    if (streams > 0) return true;
    const gone = Number((await this.kv.get(K.gone(userId))) ?? 0);
    return gone === 0 || now - gone < OFFLINE_DEBOUNCE_MS;
  }

  private async presence(userId: string, now: number): Promise<string> {
    const beat = Number((await this.kv.get(K.beat(userId))) ?? 0);
    const streams = (await this.kv.get(K.streams(userId))) ?? '-';
    const gone = Number((await this.kv.get(K.gone(userId))) ?? 0);
    return `beat ${beat ? now - beat : '-'}ms ago, streams ${streams}, gone ${gone ? now - gone : '-'}ms ago`;
  }

  private async pointer(userId: string): Promise<Pointer | null> {
    const raw = await this.kv.get(K.user(userId));
    return raw ? (JSON.parse(raw) as Pointer) : null;
  }

  private async setPointer(userId: string, pointer: Pointer): Promise<void> {
    await this.kv.set(K.user(userId), JSON.stringify(pointer), POINTER_TTL);
  }

  private async loadMatch(id: string): Promise<MatchState | null> {
    const raw = await this.kv.get(K.match(id));
    return raw ? (JSON.parse(raw) as MatchState) : null;
  }

  private async saveMatch(state: MatchState): Promise<void> {
    await this.kv.set(K.match(state.id), JSON.stringify(state), state.end ? ENDED_TTL : MATCH_TTL);
  }

  /** قفل Redis بسيط (`SET NX PX` + مسح لو لسه بتاعنا). ٣ ثواني ومافيش = ٥٠٣. */
  private async withLock<T>(name: string, run: () => Promise<T>): Promise<T> {
    const key = K.lock(name);
    const token = randomUUID();
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (!(await this.kv.setNx(key, token, LOCK_TTL_MS))) {
      if (Date.now() > deadline) throw new ServiceUnavailableException({ code: 'arena_busy' });
      await sleep(10);
    }
    try {
      return await run();
    } finally {
      await this.kv.delIfEquals(key, token).catch(() => undefined);
    }
  }
}

/**
 * اللي حصل من ناحية اللاعب ده — للصوت والأنيميشن. النهاية بتكسب أي حاجة
 * تانية، وإلا آخر حدث (انتقالين في خطوة واحدة = آخرهم هو اللي على الشاشة).
 */
export function fxFor(state: MatchState, events: readonly EngineEvent[], side: Side): ArenaFx {
  if (state.end && events.some((event) => event.kind === 'end')) {
    return state.end.reason === 'aborted' ? 'aborted' : 'end';
  }
  const last = events.at(-1);
  if (!last) return 'hello';
  switch (last.kind) {
    case 'question':
      return 'question';
    case 'right':
      return last.side === side ? 'you_right' : 'opponent_right';
    case 'wrong':
      return last.side === side ? 'you_wrong' : 'opponent_wrong';
    case 'both_wrong':
      return 'both_wrong';
    case 'timeout':
      return 'timeout';
    case 'offline':
      return last.side === side ? 'paused' : 'opponent_offline';
    case 'online':
      return last.side === side ? 'resumed' : 'opponent_back';
    case 'end':
      return 'end';
  }
}
