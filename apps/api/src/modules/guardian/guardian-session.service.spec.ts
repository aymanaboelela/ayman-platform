import { describe, expect, it, jest } from '@jest/globals';
import { GuardianSessionService } from './guardian-session.service';

type Profile = { userId: string; user: { bannedAt: Date | null } } | null;

/** ريديس صغير في الذاكرة — العدّاد والقفل والمستوى، بس اللي الخدمة بتلمسه. */
function fakeRedis(options: { down?: boolean } = {}) {
  const values = new Map<string, number>();
  const ttl = new Map<string, number>();
  const guard = () => {
    if (options.down) throw new Error('down');
  };
  return {
    values,
    ttl,
    incr: jest.fn(async (key: string) => {
      guard();
      const next = (values.get(key) ?? 0) + 1;
      values.set(key, next);
      return next;
    }),
    expire: jest.fn(async (key: string, seconds: number) => {
      ttl.set(key, seconds);
      return 1;
    }),
    set: jest.fn(async (key: string, _value: string, _ex: 'EX', seconds: number) => {
      values.set(key, 1);
      ttl.set(key, seconds);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      values.delete(key);
      ttl.delete(key);
      return 1;
    }),
    pttl: jest.fn(async (key: string) => {
      guard();
      return values.has(key) ? (ttl.get(key) ?? 0) * 1000 : -2;
    }),
    /** القفل خلص — زي ما ريديس بيعمل لما الـTTL يوصل صفر. */
    expireLock(ip: string) {
      values.delete(`guardian:lock:${ip}`);
    },
  };
}

function makeService(profile: Profile, options: { redisDown?: boolean } = {}) {
  const prisma = {
    studentProfile: { findUnique: jest.fn(async () => profile) },
  };
  const redis = fakeRedis({ down: options.redisDown });
  const service = new GuardianSessionService(prisma as never, redis as never, 'x'.repeat(32));
  return { service, prisma, redis };
}

const CODE = 'N5YGWJ7PE22Y9BKW4MSDDTPXTV';
const STUDENT = { userId: 'student-1', user: { bannedAt: null } };

/**
 * بوابة ولي الأمر.
 *
 * الكود ١٣٠ بت، فالتخمين مستحيل رياضيًا وده مش اللي التستات دي بتحميه.
 * اللي بتحميه **الحدود حوالين الباب**: مين بيتقبل، ومين بيترفض، وإزاي
 * الرفض بيتقال — لأن رسالة رفض مفصّلة بتدّي معلومة عن حساب مش بتاع اللي
 * بيسأل.
 */
describe('GuardianSessionService', () => {
  it('turns a real code into a token that names one student and nothing else', async () => {
    const { service } = makeService(STUDENT);
    const result = await service.signIn(CODE, '1.2.3.4');
    if (!result.ok) throw new Error('expected a token');

    const session = await service.verify(result.token);
    expect(session).toEqual({ studentUserId: 'student-1' });
  });

  /*
   * ⚠️ سبب واحد للرفض، مهما كان الغلط.
   *
   * كود مش موجود وحساب محظور بيرجعوا نفس الحاجة. رسايل مختلفة كانت هتخلّي
   * اللي بيحاول يعرف إن الكود ده **صح** بس الحساب متقفل — وده معلومة عن
   * حساب مش بتاعه، وصّلها له الرفض نفسه.
   */
  it('refuses an unknown code and a banned account identically', async () => {
    const unknown = makeService(null);
    const banned = makeService({ userId: 'student-2', user: { bannedAt: new Date() } });

    expect(await unknown.service.signIn(CODE, '1.2.3.4')).toEqual({ ok: false });
    expect(await banned.service.signIn(CODE, '1.2.3.4')).toEqual({ ok: false });
  });

  /*
   * العدّ **بالعنوان مش بالكود**.
   *
   * العدّ بالكود كان هيدّي أي حد طريقة يقفل بوابة أي طالب: يكتب كود غلط
   * عشرين مرة والأب الحقيقي يتقفل عليه. ده حرمان خدمة مجاني، والعدّ
   * بالعنوان بيحطّ التكلفة على اللي بيحاول.
   */
  it('counts attempts by address, so nobody can lock another student out', async () => {
    const { service, redis } = makeService(null);
    await service.signIn(CODE, '9.9.9.9');

    const key = (redis.incr.mock.calls[0] as unknown[])[0];
    expect(key).toContain('9.9.9.9');
    expect(key).not.toContain(CODE);
  });

  /*
   * خمسة غلط → قفل، وكل قفل أطول: دقيقة، خمسة، ربع ساعة، ساعة، وبيفضل
   * عند الساعة. والخمسة اللي بعد كل قفل بتبدأ من الصفر.
   */
  it('locks after five wrong codes, and each lock is longer than the last', async () => {
    const { service, redis } = makeService(null);
    const locks: number[] = [];

    for (let round = 0; round < 5; round += 1) {
      for (let i = 1; i <= 4; i += 1) {
        expect(await service.signIn(CODE, '1.2.3.4')).toEqual({ ok: false });
      }
      const fifth = await service.signIn(CODE, '1.2.3.4');
      if (fifth.ok || !fifth.retryAfterSeconds) throw new Error('expected a lock');
      locks.push(fifth.retryAfterSeconds);
      redis.expireLock('1.2.3.4');
    }

    expect(locks).toEqual([60, 300, 900, 3600, 3600]);
  });

  /*
   * ⚠️ الكود الصح وقت القفل بيترفض برضه — وما بيوصلش للداتابيز أصلًا. لو
   * كان بيعدّي، السكريبت كان هيكمّل تجريب ويعرف من الرد إنه لقى واحد صح.
   */
  it('refuses even a real code while the address is locked', async () => {
    const { service, redis, prisma } = makeService(STUDENT);
    redis.values.set('guardian:lock:1.2.3.4', 1);
    redis.ttl.set('guardian:lock:1.2.3.4', 45);

    expect(await service.signIn(CODE, '1.2.3.4')).toEqual({ ok: false, retryAfterSeconds: 45 });
    expect(prisma.studentProfile.findUnique).not.toHaveBeenCalled();
    // وعنوان تاني مش متأثر.
    expect((await service.signIn(CODE, '5.6.7.8')).ok).toBe(true);
  });

  it('does not count a successful sign-in toward the lock', async () => {
    const { service, redis } = makeService(STUDENT);
    for (let i = 0; i < 10; i += 1) await service.signIn(CODE, '1.2.3.4');
    expect(redis.incr).not.toHaveBeenCalled();
  });

  /*
   * وريديس لو وقع، الباب **بيفضل مفتوح**.
   *
   * الكود نفسه ١٣٠ بت، وقفل البوابة على كل الآباء عشان عدّاد مش شغّال
   * بيكلّف أكتر مما بيحمي — العدّاد موجود للتسريب، مش للتخمين.
   */
  it('lets a parent in when the counter itself is down', async () => {
    const { service } = makeService(STUDENT, { redisDown: true });
    expect((await service.signIn(CODE, '1.2.3.4')).ok).toBe(true);
  });

  it('refuses a token that is not ours, and one that is not a guardian token', async () => {
    const { service } = makeService(STUDENT);
    expect(await service.verify('not-a-token')).toBeNull();
    expect(await service.verify('')).toBeNull();
  });
});
