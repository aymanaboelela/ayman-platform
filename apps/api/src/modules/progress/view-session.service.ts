import { Injectable } from '@nestjs/common';
import { VIEW_SESSION_GAP_SECONDS } from '@ayman/contracts/progress';
import type { Prisma } from '../../generated/prisma/client';

/**
 * Sessionises heartbeats into one row per SITTING.
 *
 * `lesson_progress` already accumulates a lifetime total. What it cannot say
 * is when a student watched and for how long that time, which is the only
 * question the profile timeline exists to answer. This turns a stream of
 * 10-second heartbeats into rows a human can read: "الساعة ٩:٣٠، لمدة ١٢ دقيقة".
 *
 * ## Called inside the heartbeat's transaction, deliberately
 *
 * It takes a `Prisma.TransactionClient`, never the root client. Running
 * outside `HeartbeatService.record`'s transaction would let a sitting be
 * credited seconds that the `lesson_progress` write then rolled back — the
 * timeline and the total would disagree, and the timeline would be the one
 * lying.
 *
 * ## Lock ordering
 *
 * The `FOR UPDATE` here is taken AFTER the caller's lock on `lesson_progress`,
 * always, because the caller acquires that first. Two code paths taking these
 * two locks in opposite orders is how a deadlock gets built; there is exactly
 * one path into this method, and this comment is what keeps it that way.
 */
@Injectable()
export class ViewSessionService {
  /**
   * Credits `grantedSeconds` to the open sitting for this pair, or starts a
   * new one.
   *
   * `grantedSeconds` is the value `allowedHeartbeatSeconds` returned — the
   * client's claim already intersected with the wall-clock time the SERVER
   * measured. Passing `input.delta` here instead would make this table the
   * soft copy of a number the rest of the system takes care to harden, and
   * a forged timeline is worth as much to a student as a forged total.
   *
   * A granted delta of 0 is normal — a heartbeat that arrives faster than
   * time passes earns nothing — and still updates `lastSeenAt`, because the
   * student demonstrably still has the lesson open. Skipping the write on 0
   * would let a rapid-fire client roll the gap over and split one sitting
   * into many.
   */
  async credit(
    tx: Prisma.TransactionClient,
    params: {
      enrollmentId: string;
      lessonId: string;
      grantedSeconds: number;
      now: Date;
    },
  ): Promise<void> {
    const { enrollmentId, lessonId, grantedSeconds, now } = params;
    const cutoff = new Date(now.getTime() - VIEW_SESSION_GAP_SECONDS * 1000);

    // One statement for the common path. The inner SELECT … FOR UPDATE picks
    // the newest open sitting for the pair and locks it, so two tabs
    // heartbeating the same lesson serialise here instead of both reading the
    // same `watched_seconds` and one overwriting the other.
    //
    // `$executeRaw` returns the number of rows affected, which is exactly the
    // "did an open sitting exist" answer — no second SELECT to ask it.
    const extended = await tx.$executeRaw`
      UPDATE app.lesson_view_sessions
         SET watched_seconds = watched_seconds + ${grantedSeconds},
             last_seen_at    = ${now}
       WHERE id = (
               SELECT id
                 FROM app.lesson_view_sessions
                WHERE enrollment_id = ${enrollmentId}::uuid
                  AND lesson_id     = ${lessonId}::uuid
                  AND last_seen_at >= ${cutoff}
                ORDER BY last_seen_at DESC
                LIMIT 1
                  FOR UPDATE
             )
    `;

    if (extended > 0) return;

    // No open sitting: this is the start of one. Rare by construction — once
    // per sitting, against once per 10 seconds for the branch above.
    await tx.lessonViewSession.create({
      data: {
        enrollmentId,
        lessonId,
        startedAt: now,
        lastSeenAt: now,
        watchedSeconds: grantedSeconds,
      },
    });
  }
}
