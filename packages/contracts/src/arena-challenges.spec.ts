import { describe, expect, it } from 'vitest';
import { decodeArenaIntent, encodeArenaIntent, intentOfQueue, type ArenaIntent } from './arena-challenges';

const COURSE = '0190aaaa-0000-7000-8000-000000000001';
const T1 = '0190cccc-0000-7000-8000-000000000001';
const T2 = '0190cccc-0000-7000-8000-000000000002';
const CH = '0190dddd-0000-7000-8000-000000000001';

describe('arena intents', () => {
  it('round-trips every way into a match', () => {
    const intents: ArenaIntent[] = [
      { kind: 'course', courseId: COURSE },
      { kind: 'topic', courseId: COURSE, topicId: T1 },
      { kind: 'create', courseId: COURSE, topicIds: [T1, T2] },
      { kind: 'challenge', challengeId: CH },
    ];
    for (const intent of intents) expect(decodeArenaIntent(encodeArenaIntent(intent))).toEqual(intent);
  });

  it('reads back what the student is queued for, so a restart rejoins the same thing', () => {
    expect(intentOfQueue({ courseId: COURSE })).toBe(COURSE);
    expect(intentOfQueue({ courseId: COURSE, topicId: T1, challengeId: null })).toBe(`t:${COURSE}:${T1}`);
    // تحدّي اتفتح — الرجوع بيرجع له هو، مش بيفتح واحد جديد.
    expect(intentOfQueue({ courseId: COURSE, topicId: null, challengeId: CH })).toBe(`c:${CH}`);
  });
});
