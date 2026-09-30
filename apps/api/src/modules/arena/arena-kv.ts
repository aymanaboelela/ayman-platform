import type Redis from 'ioredis';

/**
 * كل اللي الساحة محتاجاه من Redis — ولا أمر زيادة.
 *
 * ## ليه Redis مش ذاكرة البروسيس
 *
 * الطابور والماتش الشغّال والساعة لازم يعيشوا بره البروسيس: الستاك بيتعمله
 * ريستارت كذا مرة في الليلة مع كل ديبلوي، وبروسيس جديد لازم يلاقي الماتشات
 * اللي كانت شغّالة عشان يقفلها ويقول للاتنين «الماتش اتقطع» بدل ما يسيبهم
 * مستنيين للأبد. ولو الـAPI اشتغل في يوم على أكتر من كونتينر، الطالبين
 * ممكن يبقوا على اتنين مختلفين — الحالة والقفل في Redis بيخلّوا ده صح من غير
 * أي تغيير.
 *
 * ## بتفشل مقفولة
 *
 * القرار اللي `redis-failure-mode-split` بيطلبه من أي مستهلك جديد: الساحة
 * **بتفشل مقفولة**. Redis وقع = مفيش ماتش عادل، فالراوتات بترد خطأ والصفحة
 * بتقول «مش متاحة»، بدل ما ماتش يتحكم من غير قفل ولا ساعة. وكل مفتاح هنا ليه
 * TTL، لأن السيرفر `volatile-lru`: مفتاح من غير TTL عمره ما بيتشال.
 *
 * ## ليه interface
 *
 * عشان السبكس بتاعة الماتش والطابور تشتغل على `MemoryArenaKv` من غير Redis
 * خالص — جوب الـunit في CI مالوش Redis، والقواعد نفسها لازم تتختبر هناك.
 */
export interface ArenaKv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  /** `SET NX PX` — للقفل. */
  setNx(key: string, value: string, ttlMs: number): Promise<boolean>;
  del(key: string): Promise<void>;
  /** يمسح القفل بس لو لسه بتاعنا. */
  delIfEquals(key: string, value: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  incr(key: string, ttlMs: number): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, ttlMs: number): Promise<void>;
  zadd(key: string, score: number, member: string, ttlMs: number): Promise<void>;
  zrem(key: string, member: string): Promise<void>;
  /** كل الأعضاء بالترتيب، مع الـscore. */
  zall(key: string): Promise<Array<{ member: string; score: number }>>;
  /** اللي الـscore بتاعهم `<= max`، لحد `limit`. */
  zdue(key: string, max: number, limit: number): Promise<string[]>;
  sadd(key: string, member: string, ttlMs: number): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
}

const DEL_IF_EQUALS = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

export class RedisArenaKv implements ArenaKv {
  constructor(private readonly redis: Redis) {}

  get(key: string) {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlMs: number) {
    await this.redis.set(key, value, 'PX', ttlMs);
  }

  async setNx(key: string, value: string, ttlMs: number) {
    return (await this.redis.set(key, value, 'PX', ttlMs, 'NX')) === 'OK';
  }

  async del(key: string) {
    await this.redis.del(key);
  }

  async delIfEquals(key: string, value: string) {
    await this.redis.eval(DEL_IF_EQUALS, 1, key, value);
  }

  async exists(key: string) {
    return (await this.redis.exists(key)) === 1;
  }

  async incr(key: string, ttlMs: number) {
    const [[, n]] = (await this.redis.multi().incr(key).pexpire(key, ttlMs).exec()) as [[unknown, number]];
    return n;
  }

  decr(key: string) {
    return this.redis.decr(key);
  }

  async expire(key: string, ttlMs: number) {
    await this.redis.pexpire(key, ttlMs);
  }

  async zadd(key: string, score: number, member: string, ttlMs: number) {
    await this.redis.multi().zadd(key, score, member).pexpire(key, ttlMs).exec();
  }

  async zrem(key: string, member: string) {
    await this.redis.zrem(key, member);
  }

  async zall(key: string) {
    const flat = await this.redis.zrange(key, 0, -1, 'WITHSCORES');
    const out: Array<{ member: string; score: number }> = [];
    for (let i = 0; i < flat.length; i += 2) out.push({ member: flat[i]!, score: Number(flat[i + 1]) });
    return out;
  }

  zdue(key: string, max: number, limit: number) {
    return this.redis.zrangebyscore(key, '-inf', max, 'LIMIT', 0, limit);
  }

  async sadd(key: string, member: string, ttlMs: number) {
    await this.redis.multi().sadd(key, member).pexpire(key, ttlMs).exec();
  }

  async srem(key: string, member: string) {
    await this.redis.srem(key, member);
  }

  smembers(key: string) {
    return this.redis.smembers(key);
  }
}

/**
 * نفس العقد في الذاكرة، بساعة بتتحقن — للسبكس. الـTTL حقيقي: مفتاح عدّى
 * وقته بيختفي زي Redis بالظبط، وده اللي بيخلّي «النبض وقف» يتختبر.
 */
export class MemoryArenaKv implements ArenaKv {
  private readonly values = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private readonly now: () => number) {}

  private live<T>(key: string): T | undefined {
    const hit = this.values.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.values.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  private put(key: string, value: unknown, ttlMs: number) {
    this.values.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  async get(key: string) {
    const value = this.live<string>(key);
    return typeof value === 'string' ? value : null;
  }

  async set(key: string, value: string, ttlMs: number) {
    this.put(key, value, ttlMs);
  }

  async setNx(key: string, value: string, ttlMs: number) {
    if (this.live(key) !== undefined) return false;
    this.put(key, value, ttlMs);
    return true;
  }

  async del(key: string) {
    this.values.delete(key);
  }

  async delIfEquals(key: string, value: string) {
    if (this.live(key) === value) this.values.delete(key);
  }

  async exists(key: string) {
    return this.live(key) !== undefined;
  }

  async incr(key: string, ttlMs: number) {
    const n = Number(this.live<string>(key) ?? 0) + 1;
    this.put(key, String(n), ttlMs);
    return n;
  }

  async decr(key: string) {
    const hit = this.values.get(key);
    const n = Number(this.live<string>(key) ?? 0) - 1;
    this.values.set(key, { value: String(n), expiresAt: hit?.expiresAt ?? Number.POSITIVE_INFINITY });
    return n;
  }

  async expire(key: string, ttlMs: number) {
    const value = this.live(key);
    if (value !== undefined) this.put(key, value, ttlMs);
  }

  private zset(key: string): Map<string, number> {
    return this.live<Map<string, number>>(key) ?? new Map();
  }

  async zadd(key: string, score: number, member: string, ttlMs: number) {
    const set = this.zset(key);
    set.set(member, score);
    this.put(key, set, ttlMs);
  }

  async zrem(key: string, member: string) {
    this.live<Map<string, number>>(key)?.delete(member);
  }

  async zall(key: string) {
    return [...this.zset(key).entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || (a.member < b.member ? -1 : 1));
  }

  async zdue(key: string, max: number, limit: number) {
    return (await this.zall(key)).filter((entry) => entry.score <= max).slice(0, limit).map((entry) => entry.member);
  }

  async sadd(key: string, member: string, ttlMs: number) {
    const set = this.live<Set<string>>(key) ?? new Set<string>();
    set.add(member);
    this.put(key, set, ttlMs);
  }

  async srem(key: string, member: string) {
    this.live<Set<string>>(key)?.delete(member);
  }

  async smembers(key: string) {
    return [...(this.live<Set<string>>(key) ?? [])];
  }
}
