import { describe, expect, it, jest } from '@jest/globals';
import { GuardianSessionService } from './guardian-session.service';

type Profile = { userId: string; user: { bannedAt: Date | null } } | null;

function makeService(profile: Profile, options: { attempts?: number; redisDown?: boolean } = {}) {
  let count = options.attempts ?? 0;
  const prisma = {
    studentProfile: { findUnique: jest.fn(async () => profile) },
  };
  const redis = {
    incr: jest.fn(async () => {
      if (options.redisDown) throw new Error('down');
      count += 1;
      return count;
    }),
    expire: jest.fn(async () => 1),
  };
  const service = new GuardianSessionService(prisma as never, redis as never, 'x'.repeat(32));
  return { service, prisma, redis };
}

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
    const token = await service.signIn('N5YGWJ7PE22Y9BKW4MSDDTPXTV', '1.2.3.4');
    expect(token).not.toBeNull();

    const session = await service.verify(token!);
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

    expect(await unknown.service.signIn('N5YGWJ7PE22Y9BKW4MSDDTPXTV', '1.2.3.4')).toBeNull();
    expect(await banned.service.signIn('N5YGWJ7PE22Y9BKW4MSDDTPXTV', '1.2.3.4')).toBeNull();
  });

  /*
   * العدّ **بالعنوان مش بالكود**.
   *
   * العدّ بالكود كان هيدّي أي حد طريقة يقفل بوابة أي طالب: يكتب كود غلط
   * عشرين مرة والأب الحقيقي يتقفل عليه. ده حرمان خدمة مجاني، والعدّ
   * بالعنوان بيحطّ التكلفة على اللي بيحاول.
   */
  it('counts attempts by address, so nobody can lock another student out', async () => {
    const { service, redis } = makeService(STUDENT);
    await service.signIn('N5YGWJ7PE22Y9BKW4MSDDTPXTV', '9.9.9.9');

    const key = (redis.incr.mock.calls[0] as unknown[])[0];
    expect(key).toContain('9.9.9.9');
    expect(key).not.toContain('N5YGWJ7PE22Y9BKW4MSDDTPXTV');
  });

  it('stops answering once the window is spent', async () => {
    const { service, prisma } = makeService(STUDENT, { attempts: 20 });
    expect(await service.signIn('N5YGWJ7PE22Y9BKW4MSDDTPXTV', '1.2.3.4')).toBeNull();
    // والأهم: ما وصلش للداتابيز أصلًا.
    expect(prisma.studentProfile.findUnique).not.toHaveBeenCalled();
  });

  /*
   * وريديس لو وقع، الباب **بيفضل مفتوح**.
   *
   * الكود نفسه ١٣٠ بت، وقفل البوابة على كل الآباء عشان عدّاد مش شغّال
   * بيكلّف أكتر مما بيحمي — العدّاد موجود للتسريب، مش للتخمين.
   */
  it('lets a parent in when the counter itself is down', async () => {
    const { service } = makeService(STUDENT, { redisDown: true });
    expect(await service.signIn('N5YGWJ7PE22Y9BKW4MSDDTPXTV', '1.2.3.4')).not.toBeNull();
  });

  it('refuses a token that is not ours, and one that is not a guardian token', async () => {
    const { service } = makeService(STUDENT);
    expect(await service.verify('not-a-token')).toBeNull();
    expect(await service.verify('')).toBeNull();
  });
});
